import * as vscode from "vscode";
import * as fs from 'fs';
import * as path from 'path';
import { Uri } from "vscode";
import * as request from "request-promise-native";
import * as manifest from './vs-manifest.json';

export class OpenFileManager {

    private _config: { [key: string]: string } = {};

    private _projects: { [key: string]: string[] } = {};

    private pathSep = /\\|\//;

    private isScaning = false;

    private backgroundScaning = false;

    private get activeDirName(): string {
        var name = vscode.window.activeTerminal?.name;
        if (name && this._config[name] && fs.existsSync(this._config[name])) {
            return name;
        } else {
            if (fs.existsSync(this._config['defaultPath'])) {
                return "defaultPath";
            }
        }
        vscode.window.showInformationMessage("You doesn't have a defaultPath!");
        return '';
    }

    private get activeDir(): string {
        const dirName = this.activeDirName;
        if (dirName && fs.existsSync(this._config[dirName])) {
            return this._config[dirName];
        }
        vscode.window.showInformationMessage("You config setting defaultPath is not correct!");
        return '';
    }

    private get activeProject(): string[] {
        if (this.isScaning && !this.backgroundScaning) {
            vscode.window.showInformationMessage("Please wait. Scaning...");
            return [];
        }

        const dirName = this.activeDirName;
        const dir = this.activeDir;
        if (dirName && dir) {
            let p = this._projects[dirName];
            if (!p || !p.length || p.length == 0) {
                this._projects[dirName] = [];
                let parent = dir.replace(path.basename(dir), "");
                let file = path.resolve(parent, "vs-manifest.json");
                if (!fs.existsSync(file)) {
                    if (this._config["autoScan"]) {
                        this.ScanCsproj(dir, dirName, true, () => { });
                        return [];
                    } else {
                        for (let index = 0; index < manifest.length; index++) {
                            const e = path.resolve(dir, manifest[index]);
                            this._projects[dirName].push(e);
                        }
                    }
                } else {
                    var read = fs.readFileSync(file, { encoding: "utf-8" });
                    this._projects[dirName] = JSON.parse(read);
                }
            }
            return this._projects[dirName];
        }
        return [];
    }

    public constructor() {
        this.loadConfig();
        this.triggerAutoScan();
    }

    public async cdDirectory() {
        var paths = await this.getCsprojDirAndFold();
        if (paths) {
            vscode.window.activeTerminal?.sendText("cd " + paths[0]);
        }
        return;
    }



    public loadConfig(): void {
        this._config = <any>vscode.workspace.getConfiguration("quickcd");
        this._config.paths?.trim()?.split(";").forEach((value, index) => {
            if (value) {
                var key = value.trim().split(this.pathSep).join('_').replace(':', '');

                this._config = Object.assign({ [key]: value }, this._config);
            }
        });
    }

    public async open() {
        let selection: string = await this.getSelectedFilePhysicPath();
        if (selection) {
            fs.stat(selection, async (error, stats) => {
                if (!stats.isDirectory()) {
                    let uri = Uri.file(selection);
                    await vscode.commands.executeCommand('vscode.open', uri);
                }
            });
        }
    }

    private async getCsprojDirAndFold(): Promise<string[] | undefined> {
        let physicDir = await this.getSelectedFilePhysicPath();
        if (!physicDir || !fs.existsSync(physicDir)) {
            return;
        }

        let parent = fs.lstatSync(physicDir).isDirectory() ? physicDir : path.dirname(physicDir);
        let fileName = physicDir.split(this.pathSep).pop() as string;

        if (!physicDir.endsWith("proj")) {
            let limit = 0;
            while (!fileName.endsWith('proj') && limit < 4) {
                fs.readdirSync(parent).forEach(file => {
                    if (file.endsWith('proj')) {
                        fileName = file;
                    }
                })
                parent = fileName.endsWith('proj') ? parent : path.resolve(parent, '..');
                limit++;
            }
        }

        let result = [fileName.endsWith('proj') ? parent : physicDir, fileName];
        return Promise.resolve(result);
    }

    public async openInVS() {

        var paths = await this.getCsprojDirAndFold();

        if (paths && fs.existsSync(path.join(paths[0], paths[1]))) {
            vscode.window.activeTerminal?.sendText("cd " + paths[0]);
            vscode.window.activeTerminal?.sendText(paths[1]);
        }
        return;
    }

    public async revealInFileExplorer() {
        let selection: string = await this.getSelectedFilePhysicPath();
        if (selection) {
            fs.stat(selection, (e, s) => {
                let dir = s.isDirectory() ? selection : path.dirname(selection);
                require('child_process').exec("start " + dir);
            })
        }
    }

    public createTerminal(name: string = '') {
        if (name != "defaultPath") {
            let canCreate = [];
            for (let key in this._config) {
                if (key != "paths" && key != "defaultPath" && fs.existsSync(this._config[key])) {
                    canCreate.push(key);
                }
            }

            if (canCreate.length == 0) {
                vscode.window.showInformationMessage("You has not set config paths value!");
                return;
            }

            vscode.window.showQuickPick(canCreate).then(res => {
                if (res) {
                    this.creatNamedTerminal(res);
                }
            });
        } else {
            this.creatNamedTerminal(name);
        }
    }

    private creatNamedTerminal(name: string) {
        const existT = vscode.window.activeTerminal?.name;
        if (existT && existT != 'defaultPath') {
            vscode.window.activeTerminal?.dispose();
        }

        if (!name) {
            vscode.window.showInformationMessage("Can't create terminal. Do you forget config root path.");
            return;
        }

        const dir = this._config[name];
        if (!fs.existsSync(dir)) {
            vscode.window.showInformationMessage("Can't create terminal. path:" + dir + " is not exist.");
            return;
        }

        var cmdPath = this._config["cmdPath"] || "C:\\Windows\\System32\\cmd.exe";

        var terminal = vscode.window.createTerminal(name, cmdPath);
        var cmd = "SET INETROOT=" + dir + "&cd /d " + dir + "&gvfs mount&" + dir + "\\tools\\path1st\\myenv.cmd";
        terminal.show();
        terminal.sendText(cmd);
    }

    public changeTerminal(t: vscode.Terminal | undefined) {

    }

    public onCloseTerminal(t: vscode.Terminal | undefined) {
        if (t) {
            const name = t.name;
            let p = this._projects[name];
            if (p) {
                p = [];
            }
        }
    }

    private triggerAutoScan() {
        let that = this;

        if (that.backgroundScaning || !this._config["autoScan"]) {
            return;
        }

        const dirName = that.activeDirName;
        const dir = that.activeDir;
        setTimeout(() => {
            if (that.activeProject.length == 0) {
                return;
            }

            let past = new Date(that.activeProject[0]);

            if (!(past instanceof Date) || isNaN(past.getTime())) {
                return;
            }

            var dif = (new Date().getTime() - past.getTime()) / (3600 * 1000);
            if (dirName && dir && !that.backgroundScaning && !that.isScaning && dif > 23) {
                that.backgroundScaning = true;
                that.ScanCsproj(dir, dirName, false, () => {
                    let parent = dir.replace(path.basename(dir), "");
                    let file = path.resolve(parent, "vs-manifest.json");
                    var read = fs.readFileSync(file, { encoding: "utf-8" });
                    that._projects[dirName] = JSON.parse(read);
                    that.backgroundScaning = false;
                });
            }
        }, 1000)
    }

    private async getSelectedFilePhysicPath(): Promise<string> {
        let selection = this.getSlection();

        if (!selection) {
            // vscode.window.showInformationMessage("Not select something.");
            return '';
        }

        if (fs.existsSync(selection)) {
            return selection;
        }

        if (selection.endsWith(".dll")) {
            selection = selection.substring(0, selection.length - 4) + ".csproj";
        }

        if (!selection.endsWith(".csproj")) {
            let isDir = selection.endsWith("/") || selection.endsWith("\\");

            let p = path.resolve(this.activeDir, selection);

            if (!fs.existsSync(p) && (selection[0] == '/' || selection[0] == '\\')) {
                selection = selection.substring(1);
                p = path.resolve(this.activeDir, selection);
            }

            if (!fs.existsSync(p)) {
                vscode.window.showInformationMessage(p + ' not fond!');
                return '';
            }

            if (isDir) {
                p += "\\";
            }

            return p;
        }

        var filter = this.getMatchedCsproj(selection);
        let isCoreProject = false;
        let tryFind: string[] = [];
        if (filter.length == 0) {
            // find netcore project in local file but not in file vs-manifest.json.
            if (selection.endsWith(".NetCore.csproj")) {
                isCoreProject = true;
                let frameworkName = selection.replace(".NetCore.csproj", ".csproj");
                frameworkName = path.basename(frameworkName);
                filter = this.getMatchedCsproj(frameworkName);
            }

            if (filter.length == 0) {
                tryFind = this.tryFindSimilarName(selection);
            }
        }

        if (filter.length == 1) {
            if (isCoreProject) {
                let mp = filter[0].split(this.pathSep);
                mp[mp.length - 1] = mp[mp.length - 1].replace(".csproj", ".NetCore.csproj");
                mp[mp.length - 2] = mp[mp.length - 2] + ".NetCore";
                filter[0] = mp.join('/');
                if (!fs.existsSync(filter[0])) {
                    vscode.window.showInformationMessage("Have not been produced file.");
                    return '';
                }
            }

            return filter[0];
        }

        if (selection.endsWith(".csproj")) {
            const name = path.basename(selection);
            const dll = name.substring(0, name.length - 7) + ".dll";
            let fromRemote = await this.getfileLocationFromRemoteDGT(dll);
            if (fromRemote) {
                this.activeProject.push(fromRemote);
                this.writeToLocationFile();
                return fromRemote;
            }
        }

        if (tryFind.length > 0) {
            vscode.window.showInformationMessage("file not fond;But has similar file: " + tryFind.join('\n'));
        } else {
            vscode.window.showInformationMessage("file not fond!");
        }

        if (filter.length > 1) {
            vscode.window.showInformationMessage("Ambiguous files:" + filter.join('\n'));
        }

        return "";
    }

    private writeToLocationFile() {
        let dir = this.activeDir;
        if (!this.activeDir) {
            return;
        }

        let parent = dir.replace(path.basename(dir), "");
        let file = path.resolve(parent, "vs-manifest.json");
        var json = JSON.stringify(this.activeProject);
        fs.writeFileSync(file, json);
    }

    private tryFindSimilarName(selection: string): string[] {
        var fp = selection.split(this.pathSep);
        let name = fp[fp.length - 1];
        fp = name.split('.');
        fp = fp.slice(0, fp.length - 1);
        let fileName = fp.join('.');
        let filter: string[] = this.activeProject;

        let priamry = filter.filter(a => {
            let arr = a.split(this.pathSep);
            let arrp = arr[arr.length - 1].replace('.csproj', '');
            return a.includes(fileName) || fileName.includes(arrp);
        })

        if (priamry.length < 4 && priamry.length > 0) {
            return priamry;
        }

        if (priamry.length > 0) {
            filter = priamry;
        }

        for (let i = 0; i < fp.length; i++) {
            const e = fp[i];
            let f = filter.filter(a => a.includes(e));
            if (f.length == 1) {
                return f;
            }

            if (f.length == 0) {
                return filter;
            }

            filter = f;
        }
        return filter.slice(0, 9);
    }

    private getMatchedCsproj(selection: string): string[] {
        var fp = selection.split(this.pathSep);
        var fName = fp[fp.length - 1];
        var filter = this.activeProject.filter(a => a.endsWith(fName));
        if (filter.length > 1) {
            let i = 2;
            while (filter.length > 1 && fp.length - i >= 0) {
                filter = filter.filter(a => {
                    let sp = a.split(this.pathSep);
                    if (sp.length - i < 0) {
                        return false;
                    }

                    return sp[sp.length - i] == fp[fp.length - i];
                });
                i++;
            }
        }

        return filter;
    }

    private findAllCsprojAsync(dir: string, done: any) {
        let that = this;
        let results: any[] = [];
        fs.readdir(dir, function (err, list) {
            if (err) return done(err);

            var i = 0;
            (function next() {
                var file = list[i++];
                if (!file) return done(null, results);

                file = path.resolve(dir, file);

                fs.stat(file, function (err, stat) {
                    if (stat && stat.isDirectory()) {
                        that.findAllCsprojAsync(file, function (err: any, res: any) {
                            results = results.concat(res);
                            next();
                        });
                    } else {
                        if (file.endsWith(".csproj")) {
                            console.log(file);
                            results.push(file);
                        }

                        next();
                    }
                });
            })();
        });
    };

    private ScanCsproj(dir: string, key: string, tip = true, done: Function) {
        if (!dir || !key) {
            return;
        }

        if (tip && !this.isScaning) {
            vscode.window.showInformationMessage("You don't have been scan fold, start scaning...");
        }

        let parent = dir.replace(path.basename(dir), "");
        let file = path.resolve(parent, "vs-manifest.json");

        this.isScaning = true;
        this.findAllCsprojAsync(dir, (error: any, res: any[]) => {
            res.unshift(new Date().toString());
            var json = JSON.stringify(res);
            fs.writeFileSync(file, json);
            this._projects[key] = res;
            if (done) {
                done();
            }

            if (tip) {
                vscode.window.showInformationMessage("Scan finished.");
            }

            this.isScaning = false;
        });
    }

    private getSlection() {
        let selection;
        const activeTextEditor = vscode.window.activeTextEditor;
        if (activeTextEditor) {
            selection = this.indentifyFile(activeTextEditor.selection);
        }

        return selection?.trim();
    }

    private indentifyFile(range: vscode.Range): string | undefined {
        var text = vscode.window.activeTextEditor?.document.getText(range);
        if (!range.isEmpty) {
            return text;
        }

        var findRange = range;
        let start = range.start.character;
        let end = range.end.character;

        const regx = /\w|\.|\_|\\|\/|\:/;

        do {
            findRange = new vscode.Range(new vscode.Position(range.start.line, start--), new vscode.Position(range.end.line, start));
            text = vscode.window.activeTextEditor?.document.getText(findRange);
        } while (start > 0 && text?.match(regx) != null)

        const maxCharater = vscode.window.activeTextEditor?.document.lineAt(range.start.line).range.end.character;
        do {
            findRange = new vscode.Range(new vscode.Position(range.start.line, end), new vscode.Position(range.end.line, ++end));
            text = vscode.window.activeTextEditor?.document.getText(findRange);
        } while (end < <number>maxCharater && text?.match(regx) != null)

        let r = new vscode.Range(new vscode.Position(range.start.line, start), new vscode.Position(range.end.line, end));
        text = vscode.window.activeTextEditor?.document.getText(r);

        if (text?.substr(0, 1).match(regx) == null) {
            text = text?.substr(1);
        }
        console.log(text?.charAt(text.length).match(regx) == null)
        console.log(text?.substr(-1))
        if (text?.substr(-1) != '' && text?.substr(-1).match(regx) == null) {
            text = text?.substr(0, text.length - 1);
            console.log(text)
        }
        return text;
    }


    private async getLatestVersion() {
        let address = this._config["DGTAddress"] || "http://10.158.22.18";
        if (!address) {
            return '';
        }

        const url = address + "/api/graph/latest-version";
        var options = {
            uri: url,
        };
        let result;
        try {
            result = await request.get(options);
        } catch (error) {
            vscode.window.showInformationMessage("Request to " + url + " failed.")
        }

        result = JSON.parse(result);
        if (result && result["status"] == 200 && result["data"]) {
            return result["data"];
        }

        return '';
    }

    private async getfileLocationFromRemoteDGT(name: string) {
        let version = await this.getLatestVersion();
        if (!version) {
            return '';
        }

        let address = this._config["DGTAddress"] || "http://10.158.22.18";

        const url = address + "/api/graph/assembly/details?";

        let result = await request.get({
            uri: url + this.objectToQueryString({
                assembly: name,
                version: version,
                process: ''
            })
        });

        result = JSON.parse(result);
        if (result && result["status"] == 200) {
            if (!(result["data"] && result["data"]["sourcePath"])) {
                vscode.window.showInformationMessage(name + " can't fond in DGT.")
                return '';
            }

            let res = result["data"]["sourcePath"] as string;
            res = res.replace(version, 'version');
            res = res.replace(/\\/g, '/');

            res = res.replace("//redmond/exchange/build/substrate/version/Sources/", '');
            let p = path.resolve(this.activeDir, res);
            if (fs.existsSync(p)) {
                return p;
            } else {
                vscode.window.showInformationMessage(name + ": exists in DGT but doesn't exist in your mechine.")
            }
        }

        return '';
    }

    private objectToQueryString(obj: any) {
        var str = [];
        for (var p in obj) {
            if (obj.hasOwnProperty(p)) {
                str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
            }
        }

        return str.join("&");
    }
}