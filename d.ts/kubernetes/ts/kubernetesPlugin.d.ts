/// <reference path="../../includes.d.ts" />
/// <reference path="kubernetesHelpers.d.ts" />
/// <reference path="kubernetesModel.d.ts" />
declare module Kubernetes {
    var _module: ng.IModule;
    var controller: (name: string, inlineAnnotatedConstructor: any[]) => ng.IModule;
    var route: (templateName: string, reloadOnSearch?: boolean) => {
        templateUrl: string;
        reloadOnSearch: boolean;
    };
}
