import * as vscode from "vscode";
import * as fs from 'fs';
import * as path from 'path';
import { Uri } from "vscode";
export class OpenFileManager {

    private _config: { [key: string]: string } = {};
    private _projects: { [key: string]: string[] } = {};

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
                var key = value.trim().split(path.sep).join('_').replace(':', '');

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
            vscode.window.activeTerminal?.sendText(physicDir.split(path.sep).pop() as string);
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
            let i = 0;
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
            if (isDir) {
                p += "\\";
            }
            
            if (fs.existsSync(p)) {
                return p;
            } else {
                return '';
            }
        }

        var fp = selection.split(path.sep);
        var fName = fp[fp.length - 1];

        var filter = this.activeProject.filter(a => a.endsWith(fName));
        if (filter.length > 1) {
            let i = 2;
            while (filter.length > 1 && fp.length - i >= 0) {
                filter = filter.filter(a => {
                    let sp = a.split(path.sep);
                    if (sp.length - i < 0) {
                        return false;
                    }
                    return sp[sp.length - i] == fp[fp.length - i];
                });
                i++;
            }
        }
        if (filter.length == 1) {
            return filter[0];
        }
        if (filter.length == 0) {
            vscode.window.showInformationMessage("file not fond!");
        }
        if (filter.length > 1) {
            vscode.window.showInformationMessage("Ambiguous files:" + filter.join('|'));
        }
        return "";
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
        var find = range;
        let start = range.start.character;
        let end = range.end.character;
        let from = start;

        while (--start >= 0 && text != ' ') {
            find = new vscode.Range(new vscode.Position(range.start.line, start), new vscode.Position(range.end.line, start + 1));
            text = vscode.window.activeTextEditor?.document.getText(range);
            from = start;
        }

        while (text != ' ' && end < 1000) {
            find = new vscode.Range(new vscode.Position(range.start.line, end), new vscode.Position(range.end.line, ++end));
            text = vscode.window.activeTextEditor?.document.getText(range);
        }

        let r = new vscode.Range(new vscode.Position(range.start.line, from), new vscode.Position(range.end.line, end));
        text = vscode.window.activeTextEditor?.document.getText(r);
        return text;
    }
}