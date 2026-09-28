import "./declarations";
// presets
import * as presetReact from "@babel/preset-react";
import * as presetTS from "@babel/preset-typescript";
import * as presetFlow from "@babel/preset-flow";
import { TransformOptions, ConfigItem } from "@babel/core";
import * as ttagTypes from "./types";

// plugins
import * as exportDefaultFromPlugin from "@babel/plugin-proposal-export-default-from";
import * as babelTtagPlugin from "babel-plugin-ttag";
import * as babelPluginDecorators from "@babel/plugin-proposal-decorators";

export const defaultPlugins: ConfigItem[] = [
    [babelPluginDecorators, { version: "2023-11" }],
    exportDefaultFromPlugin,
];

export const defaultPresets: ConfigItem[] = [
    presetFlow,
    [require("@babel/preset-env"), { modules: "commonjs", targets: "current node" }],
    presetReact,
    [presetTS, { allowDeclareFields: true }],
];

export function makeBabelConf(ttagOpts: ttagTypes.TtagOpts, cliOpts: ttagTypes.CliOpts ): TransformOptions {
    return {
        babelrc: Boolean(cliOpts.useProjectBabelrc),
        configFile: Boolean(cliOpts.useProjectBabelrc) ? undefined : false,
        presets: [
            presetFlow,
            [require("@babel/preset-env"), { loose: true, targets: "node 6.5" }],
            presetReact,
            [presetTS, { allowDeclareFields: true }]
        ],
        plugins: [...defaultPlugins, [babelTtagPlugin, ttagOpts]]
    };
}

export function makeExtractBabelConf(
    ttagOpts: ttagTypes.TtagOpts,
    cliOpts: ttagTypes.CliOpts,
    filename: string
): TransformOptions {
    const isTypeScript = /\.tsx?$/.test(filename);
    const parserPlugins: NonNullable<
        NonNullable<TransformOptions["parserOpts"]>["plugins"]
    > = [
        isTypeScript ? "typescript" : "flow",
        ...(filename.endsWith(".ts") ? [] : ["jsx"] as const),
        ["decorators", { decoratorsBeforeExport: false }],
        "decoratorAutoAccessors",
        "exportDefaultFrom"
    ];
    return {
        babelrc: Boolean(cliOpts.useProjectBabelrc),
        configFile: Boolean(cliOpts.useProjectBabelrc) ? undefined : false,
        parserOpts: {
            plugins: parserPlugins
        },
        plugins: [[babelTtagPlugin, ttagOpts]],
        ast: false,
        code: false,
        sourceMaps: false
    };
}
