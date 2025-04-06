import { RestEndpointMethodTypes } from "@octokit/rest";

export type ComponentType = 'receiver' | 'processor' | 'exporter';

export interface Component {
    name: string;
    description: string;
    stability: string;
    readmeUrl: string;
    configSchema?: ConfigSchema;
}

export interface ComponentConfig {
    name: string;
    description: string;
    stability: string;
    configuration: string;
    configSchema?: ConfigSchema;
}

export interface ConfigSchema {
    fields: ConfigField[];
    imports: string[];
    packageName: string;
}

export interface ConfigField {
    name: string;
    type: string;
    description: string;
    required: boolean;
    defaultValue?: any;
    mapstructureTag?: string;
    nestedSchema?: ConfigSchema;
}

export type GitHubContentResponse = RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"]; 