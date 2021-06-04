import * as vscode from "vscode";
import * as fs from 'fs';
import * as path from 'path';
import { Uri } from "vscode";

export class OpenFileManager {

    private _config: { [key: string]: string } = {};

    private _projects: { [key: string]: string[] } = {};

    private pathSep = /\\|\//;

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
        const dirName = this.activeDirName;
        const dir = this.activeDir;
        if (dirName && dir) {
            let p = this._projects[dirName];
            if (!p || !p.length || p.length == 0) {
                let parent = dir.replace(path.basename(dir), "");
                let file = path.resolve(parent, "vs-manifest.json");
                if (!fs.existsSync(file)) {
                    this.ScanCsproj(dir, dirName);
                }
                var read = fs.readFileSync(file, { encoding: "utf-8" });
                this._projects[dirName] = JSON.parse(read);
            }
            return this._projects[dirName];
        }

        return [];
    }

    public constructor() {
        this.loadConfig();
    }

    public cdDirectory() {
        let physicDir = this.getSelectedFilePhysicPath();
        if (physicDir) {
            let dir = physicDir;
            fs.stat(physicDir, (e, s) => {
                if (!s.isDirectory()) {
                    dir = path.dirname(dir);
                }
                vscode.window.activeTerminal?.sendText("cd " + dir);
            });
        }
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
        let selection: string = this.getSelectedFilePhysicPath();
        if (selection) {
            fs.stat(selection, async (error, stats) => {
                if (!stats.isDirectory()) {
                    let uri = Uri.file(selection);
                    await vscode.commands.executeCommand('vscode.open', uri);
                }
            });
        }
    }

    public openInVS() {
        let physicDir = this.getSelectedFilePhysicPath();
        if (physicDir && physicDir.endsWith("proj")) {
            let parent = path.dirname(physicDir);
            vscode.window.activeTerminal?.sendText("cd " + parent);
            vscode.window.activeTerminal?.sendText(physicDir.split(this.pathSep).pop() as string);
        }
    }

    public revealInFileExplorer() {
        let selection: string = this.getSelectedFilePhysicPath();
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
        if (!name) {
            vscode.window.showInformationMessage("Can't create terminal. Do you forget config root path.");
            return;
        }

        const dir = this._config[name];
        if (!fs.existsSync(dir)) {
            vscode.window.showInformationMessage("Can't create terminal. path:" + dir + " is not exist.");
            return;
        }

        var terminal = vscode.window.createTerminal(name);
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

    private getSelectedFilePhysicPath(): string {
        let selection = this.getSlection();

        if (!selection) {
            vscode.window.showInformationMessage("Not select something.");
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
                vscode.window.showInformationMessage("File or directory not fond!");
                return '';
            }

            if (isDir) {
                p += "\\";
            }

            return p;
        }

        var filter = this.getMatchedCsproj(selection);
        let isCoreProject = false;
        if (filter.length == 0) {
            // find netcore project in local file but not in file vs-manifest.json.
            if (selection.endsWith(".NetCore.csproj")) {
                isCoreProject = true;
                let frameworkName = selection.replace(".NetCore.csproj", ".csproj");
                frameworkName = path.basename(frameworkName);
                filter = this.getMatchedCsproj(frameworkName);
            }

            if (filter.length == 0) {
                var tryFind = this.tryFindSimilarName(selection);
                if (tryFind.length > 0) {
                    vscode.window.showInformationMessage("file not fond;But has similar file: " + tryFind.join('\n'));
                } else {
                    vscode.window.showInformationMessage("file not fond!");
                }
                return '';
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

        if (filter.length > 1) {
            vscode.window.showInformationMessage("Ambiguous files:" + filter.join('\n'));
        }

        return "";
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

    private findAllCsproj(dir: string, done: any) {
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
                        that.findAllCsproj(file, function (err: any, res: any) {
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

    private ScanCsproj(dir: string, key: string) {
        if (!dir || !key) {
            return;
        }
        vscode.window.showInformationMessage("You don't have been scan fold, start scaning...");
        let parent = dir.replace(path.basename(dir), "");
        let file = path.resolve(parent, "vs-manifest.json");
        this.findAllCsproj(dir, (error: any, res: any[]) => {
            var json = JSON.stringify(res);
            fs.writeFileSync(file, json);
            this._projects[key] = res;
            vscode.window.showInformationMessage("Scan finished.");
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

        do {
            findRange = new vscode.Range(new vscode.Position(range.start.line, start--), new vscode.Position(range.end.line, start));
            text = vscode.window.activeTextEditor?.document.getText(findRange);
        } while (start > 0 && text?.match(/\s/) == null)

        const maxCharater = vscode.window.activeTextEditor?.document.lineAt(range.start.line).range.end.character;
        do {
            findRange = new vscode.Range(new vscode.Position(range.start.line, end), new vscode.Position(range.end.line, ++end));
            text = vscode.window.activeTextEditor?.document.getText(findRange);
        } while (end < <number>maxCharater && text?.match(/\s/) == null)

        let r = new vscode.Range(new vscode.Position(range.start.line, start), new vscode.Position(range.end.line, end));
        text = vscode.window.activeTextEditor?.document.getText(r);
        return text;
    }
}