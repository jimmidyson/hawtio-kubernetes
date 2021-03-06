/// <reference path="../../includes.d.ts" />
declare module Kubernetes {
    var context: string;
    var hash: string;
    var defaultRoute: string;
    var pluginName: string;
    var pluginPath: string;
    var templatePath: string;
    var log: Logging.Logger;
    var keepPollingModel: boolean;
    var defaultIconUrl: string;
    var hostIconUrl: string;
    var defaultApiVersion: string;
    var labelFilterTextSeparator: string;
    var appSuffix: string;
    interface KubePod {
        id: string;
        namespace: string;
    }
    var mbean: string;
    var managerMBean: string;
    var appViewMBean: string;
    function isKubernetes(workspace: any): boolean;
    function isKubernetesTemplateManager(workspace: any): boolean;
    function isAppView(workspace: any): boolean;
    /**
     * Updates the namespaces value in the kubernetes object from the namespace values in the pods, controllers, services
     */
    function updateNamespaces(kubernetes: any, pods?: any[], replicationControllers?: any[], services?: any[]): void;
    function setJson($scope: any, id: any, collection: any): void;
    /**
     * Returns the labels text string using the <code>key1=value1,key2=value2,....</code> format
     */
    function labelsToString(labels: any, seperatorText?: string): string;
    function initShared($scope: any, $location: any, $http: any, $timeout: any, $routeParams: any, KubernetesModel: any, KubernetesState: any, KubernetesApiURL: any): void;
    /**
     * Given the list of pods lets iterate through them and find all pods matching the selector
     * and return counters based on the status of the pod
     */
    function createPodCounters(selector: any, pods: any, outputPods?: any[], podLinkQuery?: any): {
        podsLink: string;
        valid: number;
        waiting: number;
        error: number;
    };
    /**
     * Converts the given json into an array of items. If the json contains a nested set of items then that is sorted; so that services
     * are processed first; then turned into an array. Otherwise the json is put into an array so it can be processed polymorphically
     */
    function convertKubernetesJsonToItems(json: any): any[];
    function isV1beta1Or2(): boolean;
    /**
     * Returns a link to the detail page for the given entity
     */
    function entityPageLink(entity: any): string;
    function resourceKindToUriPath(kind: any): string;
    /**
     * Returns the root URL for the kind
     */
    function kubernetesUrlForKind(KubernetesApiURL: any, kind: any, namespace?: any, path?: any): string;
    /**
     * Returns the base URL for the kind of kubernetes resource or null if it cannot be found
     */
    function kubernetesUrlForItemKind(KubernetesApiURL: any, json: any): string;
    function kubernetesProxyUrlForService(KubernetesApiURL: any, service: any, path?: any): any;
    /**
     * Runs the given application JSON
     */
    function runApp($location: any, $scope: any, $http: any, KubernetesApiURL: any, json: any, name?: string, onSuccessFn?: any, namespace?: any, onCompleteFn?: any): void;
    /**
     * Returns true if the current status of the pod is running
     */
    function isRunning(podCurrentState: any): any;
    /**
     * Returns true if the labels object has all of the key/value pairs from the selector
     */
    function selectorMatches(selector: any, labels: any): boolean;
    /**
     * Returns a link to the kibana logs web application
     */
    function kibanaLogsLink(ServiceRegistry: any): string;
    function openLogsForPods(ServiceRegistry: any, $window: any, pods: any): void;
    function resizeController($http: any, KubernetesApiURL: any, replicationController: any, newReplicas: any, onCompleteFn?: any): void;
    function statusTextToCssClass(text: any): string;
    function podStatus(pod: any): any;
    function createAppViewPodCounters(appView: any): any[];
    function createAppViewServiceViews(appView: any): any[];
    /**
     * converts a git path into an accessible URL for the browser
     */
    function gitPathToUrl(iconPath: any, branch?: string): string;
}
