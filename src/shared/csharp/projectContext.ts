import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { XMLParser } from "fast-xml-parser";

const execFileAsync = promisify(execFile);
const evaluatedPropertyNames = ["RootNamespace", "TargetFramework", "LangVersion", "AssemblyName"] as const;

export interface ProjectProperties {
    readonly rootNamespace?: string;
    readonly targetFramework?: string;
    readonly langVersion?: string;
    readonly assemblyName?: string;
}

export interface ProjectContext extends ProjectProperties {
    readonly projectPath: string;
    readonly projectDirectory: string;
}

export interface ProjectContextProvider {
    getProperties(projectPath: string): Promise<ProjectProperties | undefined>;
}

export class MsBuildProjectContextProvider implements ProjectContextProvider {
    public async getProperties(projectPath: string): Promise<ProjectProperties | undefined> {
        try {
            const propertyArgument = `-getProperty:${evaluatedPropertyNames.join(",")}`;
            const { stdout } = await execFileAsync("dotnet", ["msbuild", projectPath, propertyArgument, "-nologo"], {
                timeout: 15_000,
                windowsHide: true,
            });

            return parseMsBuildProperties(stdout);
        } catch {
            return undefined;
        }
    }
}

export class XmlProjectContextProvider implements ProjectContextProvider {
    public async getProperties(projectPath: string): Promise<ProjectProperties | undefined> {
        try {
            const xml = await fs.readFile(projectPath, "utf8");
            return parseProjectXml(xml);
        } catch {
            return undefined;
        }
    }
}

/**
 * 定位目标目录所属的最近 C# 项目，并按 provider 顺序读取项目属性。
 */
export async function resolveProjectContext(
    targetDirectory: string,
    providers: readonly ProjectContextProvider[] = [new MsBuildProjectContextProvider(), new XmlProjectContextProvider()],
): Promise<ProjectContext | undefined> {
    const projectPath = await findNearestProject(targetDirectory);
    if (!projectPath) {
        return undefined;
    }

    for (const provider of providers) {
        const properties = await provider.getProperties(projectPath);
        if (properties) {
            return {
                projectPath,
                projectDirectory: path.dirname(projectPath),
                ...properties,
            };
        }
    }

    return {
        projectPath,
        projectDirectory: path.dirname(projectPath),
    };
}

export async function findNearestProject(targetDirectory: string): Promise<string | undefined> {
    let currentDirectory = path.resolve(targetDirectory);

    while (true) {
        try {
            const entries = await fs.readdir(currentDirectory, { withFileTypes: true });
            const project = entries
                .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".csproj"))
                .sort((left, right) => left.name.localeCompare(right.name))[0];

            if (project) {
                return path.join(currentDirectory, project.name);
            }
        } catch {
            return undefined;
        }

        const parentDirectory = path.dirname(currentDirectory);
        if (parentDirectory === currentDirectory) {
            return undefined;
        }

        currentDirectory = parentDirectory;
    }
}

export function parseMsBuildProperties(output: string): ProjectProperties | undefined {
    const jsonStart = output.indexOf("{");
    const jsonEnd = output.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < jsonStart) {
        return undefined;
    }

    try {
        const result = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as {
            Properties?: Record<string, unknown>;
        };
        return normalizeProperties(result.Properties);
    } catch {
        return undefined;
    }
}

export function parseProjectXml(xml: string): ProjectProperties {
    const parser = new XMLParser({ parseTagValue: false, trimValues: true });
    const document = parser.parse(xml) as {
        Project?: { PropertyGroup?: Record<string, unknown> | Record<string, unknown>[] };
    };
    const propertyGroups = document.Project?.PropertyGroup;
    const groups = Array.isArray(propertyGroups) ? propertyGroups : propertyGroups ? [propertyGroups] : [];
    const properties: Record<string, unknown> = {};

    for (const group of groups) {
        for (const propertyName of evaluatedPropertyNames) {
            if (group[propertyName] !== undefined) {
                properties[propertyName] = group[propertyName];
            }
        }
    }

    return normalizeProperties(properties) ?? {};
}

function normalizeProperties(properties: Record<string, unknown> | undefined): ProjectProperties | undefined {
    if (!properties) {
        return undefined;
    }

    return {
        rootNamespace: asNonEmptyString(properties.RootNamespace),
        targetFramework: asNonEmptyString(properties.TargetFramework),
        langVersion: asNonEmptyString(properties.LangVersion),
        assemblyName: asNonEmptyString(properties.AssemblyName),
    };
}

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
}
