"use strict";
import * as vscode from "vscode";
import { Constants } from "./constants";

export class Utility {


    public static getConfiguration(section?: string): vscode.WorkspaceConfiguration {

            return vscode.workspace.getConfiguration(section);
    }
}
