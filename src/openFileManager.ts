import * as vscode from "vscode";
import * as fs from 'fs';
import * as path from 'path';
import { Uri } from "vscode";
import * as request from "request-promise-native";
import * as manifest from './vs-manifest.json';
import { ProjectGroup } from "./ProjectGroup";
const readline = require('readline');

export class OpenFileManager {

    private _config: { [key: string]: string } = {};

    private _projects: { [key: string]: (ProjectGroup | null)[] } = {};

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
        console.log("You config setting defaultPath is not correct!");
        return '';
    }

    private get activeProject(): (ProjectGroup | null)[] {
        const dirName = this.activeDirName;
        const dir = this.activeDir;
        if (dirName && dir) {
            let p = this._projects[dirName];
            if (!p || !p.length || p.length == 0) {
                this._projects[dirName] = [];
                let parent = dir.replace(path.basename(dir), "");
                let file = path.resolve(parent, "vs-manifest.json");
                const read = fs.readFileSync(file, { encoding: "utf-8" });
                let arr = <string[]>JSON.parse(read);
                //this._projects[dirName] = arr;

                let mfile = path.resolve(dir, "DotNetCoreMigration\\DotNetCoreMigrationAlignment.md");
                let t = fs.readFileSync(mfile, "utf-8").split('\n').map(a => a.split('|'));
                const map = fs.readFileSync(mfile, "utf-8").split('\n').map(a => {
                    var ar = a.split("|");
                    if (ar.length > 7) {
                        return {
                            AssemblyName: ar[1].replace('.dll', '').trim(),
                            FramworkPath: ar[2].trim(),
                            NetCorePath: ar[3].trim()
                        }
                    }
                    return null;
                }).filter(a => a != null);
                this._projects[dirName] = map;

            }
            return this._projects[dirName];
        }
        return [];
    }

    public constructor() {
        this.loadConfig();
    }

    public async cdDirectory() {
        let p = await this.getFhysicalPath();

        let dir = path.dirname(p);

        if (fs.existsSync(dir)) {
            vscode.window.activeTerminal?.sendText("cd " + dir);
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
        let selection: string = await this.getFhysicalPath();
        if (selection) {
            fs.stat(selection, async (error, stats) => {
                if (!stats.isDirectory()) {
                    let uri = Uri.file(selection);
                    await vscode.commands.executeCommand('vscode.open', uri);
                }
            });
        }
    }

    public async openInVS() {

        var paths = await this.getFhysicalPath();

        if (fs.existsSync(paths)) {
            vscode.window.activeTerminal?.sendText("cd " + path.dirname(paths));
            vscode.window.activeTerminal?.sendText(path.basename(paths));
        }
        return;
    }

    public async revealInFileExplorer() {
        let selection: string = await this.getFhysicalPath();
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
                vscode.window.activeTerminal?.sendText("echo You has not set config paths value!")
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
            vscode.window.activeTerminal?.sendText("echo Can't create terminal. Do you forget config root path.")
            return;
        }

        let dir = this._config[name];
        if (!fs.existsSync(dir)) {
            for (let item of this._config.paths.split(';')) {
                if (fs.existsSync(item)) {
                    dir = item;
                    this._config[name] == item;
                }
            }
            vscode.window.activeTerminal?.sendText("echo Can't create terminal. path:" + dir + " is not exist.")
            return;
        }

        var cmdPath = this._config["cmdPath"] || "C:\\Windows\\System32\\cmd.exe";

        var terminal = vscode.window.createTerminal(name, cmdPath);
        var cmd = "SET INETROOT=" + dir + "&cd /d " + dir + "&gvfs mount&" + dir + "\\tools\\path1st\\myenv.cmd";
        terminal.show();
        terminal.sendText(cmd);
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

    private async getFhysicalPath(): Promise<string> {
        let selection = this.getSlection();
        if (!selection) {
            return '';
        }
        for (let item in this._config) {
            selection = selection.replace(this._config[item], '');
        }

        const ps = this.activeProject;

        let name = null;
        if (selection.endsWith('.dll')) {
            name = selection.replace('.dll', '').split(this.pathSep).pop();
        } else {
            name = selection.split(this.pathSep).pop();
        }

        for (let item of ps) {
            if (item?.NetCorePath.endsWith(selection)) {
                return Promise.resolve(path.join(this.activeDir, item.NetCorePath));
            }

            if (item?.NetStdPath?.endsWith(selection)) {
                return Promise.resolve(path.join(this.activeDir, item.NetStdPath));
            }

            if (item?.FramworkPath?.endsWith(selection)) {
                return Promise.resolve(path.join(this.activeDir, item.FramworkPath));
            }

            if (item?.AssemblyName == name) {
                let dir = path.join(this.activeDir, <string>item?.NetCorePath);
                if (!fs.existsSync(dir)) {
                    dir = path.join(this.activeDir, <string>item?.FramworkPath);
                }

                return Promise.resolve(dir);
            }
        }

        if (name) {
            if (name.indexOf('\\') != -1 || name.indexOf('/') != -1) {
                name = name.split(this.pathSep).pop();
            }

            const p = await this.getfileLocationFromRemoteDGT(name + '.dll');
            if (fs.existsSync(p)) {
                return Promise.resolve(p);
            }
        }

        if (fs.existsSync(selection)) {
            return Promise.resolve(selection);
        }

        selection = path.join(this.activeDir, selection);
        if (fs.existsSync(selection)) {
            return Promise.resolve(selection);
        }
        return Promise.resolve('');
    }

    private getSlection(): string | undefined {
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
        }

        result = JSON.parse(result);
        if (result && result["status"] == 200 && result["data"]) {
            return result["data"];
        }

        return '';
    }

    private async getfileLocationFromRemoteDGT(name: string): Promise<string> {
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
                //vscode.window.showInformationMessage(name + ": exists in DGT but doesn't exist in your mechine.")
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