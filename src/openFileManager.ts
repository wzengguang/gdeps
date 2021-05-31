import { Constants } from './constants';
import * as vscode from "vscode";
import * as fs from 'fs';
import * as constants from "constants";
import { Uri } from "vscode";
export class OpenFileManager {
    private get document() {
        return vscode.window.activeTextEditor?.document;
    }


    public async open() {
        let selection: string = "";
        const activeTextEditor = vscode.window.activeTextEditor;
        if (activeTextEditor) {
            selection = this.document?.getText(activeTextEditor.selection) as string;
        }

        if (fs.existsSync(selection)) {
            let uri = Uri.file(selection);
            await vscode.commands.executeCommand('vscode.open', uri);
        } else {
            vscode.window.showInformationMessage("file not find!");
        }
    }

    public createTerminal() {
        var terminal = vscode.window.createTerminal();
        var cmd = "SET INETROOT=" + Constants.activeBasePath + "&cd /d " + Constants.activeBasePath + "&gvfs mount&" + Constants.activeBasePath + "\\tools\\path1st\\myenv.cmd";
        terminal.sendText(cmd);
    }
}