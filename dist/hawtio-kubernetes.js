/// <reference path="../libs/hawtio-forms/defs.d.ts"/>
/// <reference path="../libs/hawtio-ui/defs.d.ts"/>
/// <reference path="../libs/hawtio-utilities/defs.d.ts"/>
/// <reference path="../libs/hawtio-wiki/defs.d.ts"/>

/// <reference path="../../includes.ts"/>
var Service;
(function (Service) {
    Service.pluginName = 'Service';
    Service.log = Logger.get(Service.pluginName);
    /**
     * Used to specify whether the "service" URL should be polled for services using kubernetes or kubernetes-like service discover.
     * For more details see: https://github.com/hawtio/hawtio/blob/master/docs/Services.md
     */
    Service.pollServices = false;
    /**
     * Returns true if there is a service available for the given ID or false
     */
    function hasService(ServiceRegistry, serviceName) {
        if (!ServiceRegistry || !serviceName) {
            return false;
        }
        var answer = false;
        angular.forEach(ServiceRegistry.services, function (service) {
            if (serviceName === service.id) {
                answer = true;
            }
        });
        return answer;
    }
    Service.hasService = hasService;
    /**
     * Returns the service for the given service name (ID) or null if it cannot be found
     *
     * @param ServiceRegistry
     * @param serviceName
     * @return {null}
     */
    function findService(ServiceRegistry, serviceName) {
        var answer = null;
        if (ServiceRegistry && serviceName) {
            angular.forEach(ServiceRegistry.services, function (service) {
                if (serviceName === service.id) {
                    answer = service;
                }
            });
        }
        return answer;
    }
    Service.findService = findService;
    /**
     * Returns the service link for the given service name
     *
     * @param ServiceRegistry
     * @param serviceName
     * @return {null}
     */
    function serviceLink(ServiceRegistry, serviceName) {
        var service = findService(ServiceRegistry, serviceName);
        if (service) {
            var portalIP = service.portalIP;
            var port = service.port;
            // TODO use annotations to support other kinds of protocol?
            var protocol = "http://";
            if (portalIP) {
                if (port) {
                    return protocol + portalIP + ":" + port + "/";
                }
                else {
                    return protocol + portalIP;
                }
            }
        }
        return "";
    }
    Service.serviceLink = serviceLink;
})(Service || (Service = {}));

/// <reference path="serviceHelpers.ts"/>
/// <reference path="../../includes.ts"/>
var Service;
(function (Service) {
    Service._module = angular.module(Service.pluginName, ['hawtio-core']);
    Service._module.factory("ServiceRegistry", ['$http', '$rootScope', 'workspace', function ($http, $rootScope, workspace) {
        var self = {
            name: 'ServiceRegistry',
            services: [],
            fetch: function (next) {
                if (Kubernetes.isKubernetesTemplateManager(workspace) || Service.pollServices) {
                    $http({
                        method: 'GET',
                        url: 'service'
                    }).success(function (data, status, headers, config) {
                        self.onSuccessfulPoll(next, data, status, headers, config);
                    }).error(function (data, status, headers, config) {
                        self.onFailedPoll(next, data, status, headers, config);
                    });
                }
            },
            onSuccessfulPoll: function (next, data, status, headers, config) {
                var triggerUpdate = ArrayHelpers.sync(self.services, data.items);
                if (triggerUpdate) {
                    Service.log.debug("Services updated: ", self.services);
                    Core.$apply($rootScope);
                }
                next();
            },
            onFailedPoll: function (next, data, status, headers, config) {
                Service.log.debug("Failed poll, data: ", data, " status: ", status);
                next();
            }
        };
        return self;
    }]);
    Service._module.run(['ServiceRegistry', '$timeout', 'jolokia', function (ServiceRegistry, $timeout, jolokia) {
        ServiceRegistry.go = PollHelpers.setupPolling(ServiceRegistry, function (next) {
            ServiceRegistry.fetch(next);
        }, 2000, $timeout, jolokia);
        ServiceRegistry.go();
        Service.log.debug("Loaded");
    }]);
    hawtioPluginLoader.addModule(Service.pluginName);
})(Service || (Service = {}));

/// <reference path="../../includes.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.context = '/kubernetes';
    Kubernetes.hash = '#' + Kubernetes.context;
    Kubernetes.defaultRoute = Kubernetes.hash + '/apps';
    Kubernetes.pluginName = 'Kubernetes';
    Kubernetes.pluginPath = 'plugins/kubernetes/';
    Kubernetes.templatePath = Kubernetes.pluginPath + 'html/';
    Kubernetes.log = Logger.get(Kubernetes.pluginName);
    Kubernetes.keepPollingModel = true;
    Kubernetes.defaultIconUrl = Core.url("/img/kubernetes.svg");
    Kubernetes.hostIconUrl = Core.url("/img/host.svg");
    Kubernetes.defaultApiVersion = "v1beta2";
    Kubernetes.labelFilterTextSeparator = ",";
    Kubernetes.appSuffix = ".app";
    //var fabricDomain = Fabric.jmxDomain;
    var fabricDomain = "io.fabric8";
    Kubernetes.mbean = fabricDomain + ":type=Kubernetes";
    Kubernetes.managerMBean = fabricDomain + ":type=KubernetesManager";
    Kubernetes.appViewMBean = fabricDomain + ":type=AppView";
    function isKubernetes(workspace) {
        // return workspace.treeContainsDomainAndProperties(fabricDomain, {type: "Kubernetes"});
        return true;
    }
    Kubernetes.isKubernetes = isKubernetes;
    function isKubernetesTemplateManager(workspace) {
        // return workspace.treeContainsDomainAndProperties(fabricDomain, {type: "KubernetesTemplateManager"});
        return true;
    }
    Kubernetes.isKubernetesTemplateManager = isKubernetesTemplateManager;
    function isAppView(workspace) {
        // return workspace.treeContainsDomainAndProperties(fabricDomain, {type: "AppView"});
        return true;
    }
    Kubernetes.isAppView = isAppView;
    /**
     * Updates the namespaces value in the kubernetes object from the namespace values in the pods, controllers, services
     */
    function updateNamespaces(kubernetes, pods, replicationControllers, services) {
        if (pods === void 0) { pods = []; }
        if (replicationControllers === void 0) { replicationControllers = []; }
        if (services === void 0) { services = []; }
        var byNamespace = function (thing) {
            return thing.namespace;
        };
        function pushIfNotExists(array, items) {
            angular.forEach(items, function (value) {
                if ($.inArray(value, array) < 0) {
                    array.push(value);
                }
            });
        }
        var namespaces = [];
        pushIfNotExists(namespaces, pods.map(byNamespace));
        pushIfNotExists(namespaces, services.map(byNamespace));
        pushIfNotExists(namespaces, replicationControllers.map(byNamespace));
        namespaces = namespaces.sort();
        kubernetes.namespaces = namespaces;
        kubernetes.selectedNamespace = kubernetes.selectedNamespace || namespaces[0];
    }
    Kubernetes.updateNamespaces = updateNamespaces;
    function setJson($scope, id, collection) {
        $scope.id = id;
        if (!$scope.fetched) {
            return;
        }
        if (!id) {
            $scope.json = '';
            return;
        }
        if (!collection) {
            return;
        }
        var item = collection.find(function (item) {
            return item.id === id;
        });
        if (item) {
            $scope.json = angular.toJson(item, true);
            $scope.item = item;
        }
        else {
            $scope.id = undefined;
            $scope.json = '';
            $scope.item = undefined;
        }
    }
    Kubernetes.setJson = setJson;
    /**
     * Returns the labels text string using the <code>key1=value1,key2=value2,....</code> format
     */
    function labelsToString(labels, seperatorText) {
        if (seperatorText === void 0) { seperatorText = Kubernetes.labelFilterTextSeparator; }
        var answer = "";
        angular.forEach(labels, function (value, key) {
            var separator = answer ? seperatorText : "";
            answer += separator + key + "=" + value;
        });
        return answer;
    }
    Kubernetes.labelsToString = labelsToString;
    function initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL) {
        if (!KubernetesState.selectedNamespace) {
            KubernetesState.selectedNamespace = $routeParams.namespace || $location.search()["namespace"];
        }
        if (!KubernetesState.selectedNamespace) {
            if (angular.isArray(KubernetesState.namespaces) && KubernetesState.namespaces.length) {
                KubernetesState.selectedNamespace = KubernetesState.namespaces[0];
            }
        }
        $scope.resizeDialog = {
            controller: null,
            newReplicas: 0,
            dialog: new UI.Dialog(),
            onOk: function () {
                var resizeDialog = $scope.resizeDialog;
                resizeDialog.dialog.close();
                resizeController($http, KubernetesApiURL, resizeDialog.controller, resizeDialog.newReplicas, function () {
                    // lets immediately update the replica count to avoid waiting for the next poll
                    ($scope.resizeDialog.controller.currentState || {}).replicas = $scope.resizeDialog.newReplicas;
                    Core.$apply($scope);
                });
            },
            open: function (controller) {
                var resizeDialog = $scope.resizeDialog;
                resizeDialog.controller = controller;
                resizeDialog.newReplicas = Core.pathGet(controller, ["currentState", "replicas"]);
                resizeDialog.dialog.open();
                $timeout(function () {
                    $('#replicas').focus();
                }, 50);
            },
            close: function () {
                $scope.resizeDialog.dialog.close();
            }
        };
        // update the URL if the filter is changed
        $scope.$watch("tableConfig.filterOptions.filterText", function (text) {
            $location.search("q", text);
        });
        $scope.$on("labelFilterUpdate", function ($event, text) {
            var filterOptions = ($scope.tableConfig || {}).filterOptions || {};
            var currentFilter = filterOptions.filterText;
            if (Core.isBlank(currentFilter)) {
                filterOptions.filterText = text;
            }
            else {
                var expressions = currentFilter.split(/\s+/);
                if (expressions.any(text)) {
                    // lets exclude this filter expression
                    expressions = expressions.remove(text);
                    filterOptions.filterText = expressions.join(" ");
                }
                else {
                    filterOptions.filterText = currentFilter + " " + text;
                }
            }
            $scope.id = undefined;
        });
    }
    Kubernetes.initShared = initShared;
    /**
     * Given the list of pods lets iterate through them and find all pods matching the selector
     * and return counters based on the status of the pod
     */
    function createPodCounters(selector, pods, outputPods, podLinkQuery) {
        if (outputPods === void 0) { outputPods = []; }
        if (podLinkQuery === void 0) { podLinkQuery = null; }
        var filterFn;
        if (angular.isFunction(selector)) {
            filterFn = selector;
        }
        else {
            filterFn = function (pod) { return selectorMatches(selector, pod.labels); };
        }
        var answer = {
            podsLink: "",
            valid: 0,
            waiting: 0,
            error: 0
        };
        if (selector) {
            if (!podLinkQuery) {
                podLinkQuery = Kubernetes.labelsToString(selector, " ");
            }
            answer.podsLink = Core.url("/kubernetes/pods?q=" + encodeURIComponent(podLinkQuery));
            angular.forEach(pods, function (pod) {
                if (filterFn(pod)) {
                    outputPods.push(pod);
                    var status = (pod.currentState || {}).status;
                    if (status) {
                        var lower = status.toLowerCase();
                        if (lower.startsWith("run")) {
                            answer.valid += 1;
                        }
                        else if (lower.startsWith("wait")) {
                            answer.waiting += 1;
                        }
                        else if (lower.startsWith("term") || lower.startsWith("error") || lower.startsWith("fail")) {
                            answer.error += 1;
                        }
                    }
                    else {
                        answer.error += 1;
                    }
                }
            });
        }
        return answer;
    }
    Kubernetes.createPodCounters = createPodCounters;
    /**
     * Converts the given json into an array of items. If the json contains a nested set of items then that is sorted; so that services
     * are processed first; then turned into an array. Otherwise the json is put into an array so it can be processed polymorphically
     */
    function convertKubernetesJsonToItems(json) {
        var items = json.items;
        if (angular.isArray(items)) {
            // TODO we could check for List or Config types here and warn if not
            // sort the services first
            var answer = [];
            items.forEach(function (item) {
                if (item.kind === "Service") {
                    answer.push(item);
                }
            });
            items.forEach(function (item) {
                if (item.kind !== "Service") {
                    answer.push(item);
                }
            });
            return answer;
        }
        else {
            return [json];
        }
    }
    Kubernetes.convertKubernetesJsonToItems = convertKubernetesJsonToItems;
    function isV1beta1Or2() {
        return Kubernetes.defaultApiVersion === "v1beta1" || Kubernetes.defaultApiVersion === "v1beta2";
    }
    Kubernetes.isV1beta1Or2 = isV1beta1Or2;
    /**
     * Returns a link to the detail page for the given entity
     */
    function entityPageLink(entity) {
        if (entity) {
            var id = entity.id;
            var kind = entity.kind;
            if (kind && id) {
                var path = kind.substring(0, 1).toLowerCase() + kind.substring(1) + "s";
                var namespace = entity.namespace;
                if (namespace && !isIgnoreNamespaceKind(kind)) {
                    return UrlHelpers.join('/kubernetes/namespace', namespace, path, id);
                }
                else {
                    return UrlHelpers.join('/kubernetes', path, id);
                }
            }
        }
        return null;
    }
    Kubernetes.entityPageLink = entityPageLink;
    function resourceKindToUriPath(kind) {
        var kindPath = kind.toLowerCase() + "s";
        if (kindPath === "replicationcontrollers" && isV1beta1Or2()) {
            kindPath = "replicationControllers";
        }
        return kindPath;
    }
    Kubernetes.resourceKindToUriPath = resourceKindToUriPath;
    function isIgnoreNamespaceKind(kind) {
        return kind === "Host" || kind === "Minion";
    }
    /**
     * Returns the root URL for the kind
     */
    function kubernetesUrlForKind(KubernetesApiURL, kind, namespace, path) {
        if (namespace === void 0) { namespace = null; }
        if (path === void 0) { path = null; }
        var pathSegment = "";
        if (path) {
            pathSegment = "/" + Core.trimLeading(path, "/");
        }
        var kindPath = resourceKindToUriPath(kind);
        var ignoreNamespace = isIgnoreNamespaceKind(kind);
        if (isV1beta1Or2() || ignoreNamespace) {
            var postfix = "";
            if (namespace && !ignoreNamespace) {
                postfix = "?namespace=" + namespace;
            }
            return UrlHelpers.join(KubernetesApiURL, "/api/" + Kubernetes.defaultApiVersion + "/" + kindPath + pathSegment + postfix);
        }
        else {
            return UrlHelpers.join(KubernetesApiURL, "/api/" + Kubernetes.defaultApiVersion + "/ns/" + namespace + "/" + kindPath + pathSegment + postfix);
        }
    }
    Kubernetes.kubernetesUrlForKind = kubernetesUrlForKind;
    ;
    /**
     * Returns the base URL for the kind of kubernetes resource or null if it cannot be found
     */
    function kubernetesUrlForItemKind(KubernetesApiURL, json) {
        var kind = json.kind;
        if (kind) {
            return kubernetesUrlForKind(KubernetesApiURL, kind, json.namespace);
        }
        else {
            Kubernetes.log.warn("Ignoring missing kind " + kind + " for kubernetes json: " + angular.toJson(json));
            return null;
        }
    }
    Kubernetes.kubernetesUrlForItemKind = kubernetesUrlForItemKind;
    function kubernetesProxyUrlForService(KubernetesApiURL, service, path) {
        if (path === void 0) { path = null; }
        var pathSegment = "";
        if (path) {
            pathSegment = "/" + Core.trimLeading(path, "/");
        }
        else {
            pathSegment = "/";
        }
        var namespace = service.namespace;
        if (isV1beta1Or2()) {
            var postfix = "?namespace=" + namespace;
            return KubernetesApiURL.then(function (KubernetesApiURL) {
                return UrlHelpers.join(KubernetesApiURL, "/api/" + Kubernetes.defaultApiVersion + "/proxy/services/" + service.id + pathSegment + postfix);
            });
        }
        else {
            return KubernetesApiURL.then(function (KubernetesApiURL) {
                return UrlHelpers.join(KubernetesApiURL, "/api/" + Kubernetes.defaultApiVersion + "/ns/" + namespace + "/services/" + service.name + pathSegment);
            });
        }
    }
    Kubernetes.kubernetesProxyUrlForService = kubernetesProxyUrlForService;
    /**
     * Runs the given application JSON
     */
    function runApp($location, $scope, $http, KubernetesApiURL, json, name, onSuccessFn, namespace, onCompleteFn) {
        if (name === void 0) { name = "App"; }
        if (onSuccessFn === void 0) { onSuccessFn = null; }
        if (namespace === void 0) { namespace = null; }
        if (onCompleteFn === void 0) { onCompleteFn = null; }
        if (json) {
            if (angular.isString(json)) {
                json = angular.fromJson(json);
            }
            name = name || "App";
            var postfix = namespace ? " in namespace " + namespace : "";
            Core.notification('info', "Running " + name + postfix);
            KubernetesApiURL.then(function (KubernetesApiURL) {
                var items = convertKubernetesJsonToItems(json);
                angular.forEach(items, function (item) {
                    var url = kubernetesUrlForItemKind(KubernetesApiURL, item);
                    if (url) {
                        $http.post(url, item).success(function (data, status, headers, config) {
                            Kubernetes.log.debug("Got status: " + status + " on url: " + url + " data: " + data + " after posting: " + angular.toJson(item));
                            if (angular.isFunction(onCompleteFn)) {
                                onCompleteFn();
                            }
                            Core.$apply($scope);
                        }).error(function (data, status, headers, config) {
                            var message = null;
                            if (angular.isObject(data)) {
                                message = data.message;
                                var reason = data.reason;
                                if (reason === "AlreadyExists") {
                                    // lets ignore duplicates
                                    Kubernetes.log.debug("entity already exists at " + url);
                                    return;
                                }
                            }
                            if (!message) {
                                message = "Failed to POST to " + url + " got status: " + status;
                            }
                            Kubernetes.log.warn("Failed to save " + url + " status: " + status + " response: " + angular.toJson(data, true));
                            Core.notification('error', message);
                        });
                    }
                });
            });
        }
    }
    Kubernetes.runApp = runApp;
    /**
     * Returns true if the current status of the pod is running
     */
    function isRunning(podCurrentState) {
        var status = (podCurrentState || {}).status;
        if (status) {
            var lower = status.toLowerCase();
            return lower.startsWith("run");
        }
        else {
            return false;
        }
    }
    Kubernetes.isRunning = isRunning;
    /**
     * Returns true if the labels object has all of the key/value pairs from the selector
     */
    function selectorMatches(selector, labels) {
        if (angular.isObject(labels)) {
            var answer = true;
            var count = 0;
            angular.forEach(selector, function (value, key) {
                count++;
                if (answer && labels[key] !== value) {
                    answer = false;
                }
            });
            return answer && count > 0;
        }
        else {
            return false;
        }
    }
    Kubernetes.selectorMatches = selectorMatches;
    /**
     * Returns a link to the kibana logs web application
     */
    function kibanaLogsLink(ServiceRegistry) {
        var link = Service.serviceLink(ServiceRegistry, "kibana-service");
        if (link) {
            if (!link.endsWith("/")) {
                link += "/";
            }
            return link + "#/discover/Fabric8";
        }
        else {
            return null;
        }
    }
    Kubernetes.kibanaLogsLink = kibanaLogsLink;
    function openLogsForPods(ServiceRegistry, $window, pods) {
        function encodePodIdInSearch(id) {
            // TODO until we figure out the best encoding lets just split at the "-"
            if (id) {
                var idx = id.indexOf("-");
                if (idx > 0) {
                    id = id.substring(0, idx);
                }
            }
            //var quoteText = "%27";
            var quoteText = "";
            return quoteText + id + quoteText;
        }
        var link = kibanaLogsLink(ServiceRegistry);
        if (link) {
            var query = "";
            var count = 0;
            angular.forEach(pods, function (item) {
                var id = item.id;
                if (id) {
                    var space = query ? " || " : "";
                    count++;
                    query += space + encodePodIdInSearch(id);
                }
            });
            if (query) {
                if (count > 1) {
                    query = "(" + query + ")";
                }
                link += "?_a=(query:'k8s_pod:" + query + "')";
            }
            var newWindow = $window.open(link, "viewLogs");
        }
    }
    Kubernetes.openLogsForPods = openLogsForPods;
    function resizeController($http, KubernetesApiURL, replicationController, newReplicas, onCompleteFn) {
        if (onCompleteFn === void 0) { onCompleteFn = null; }
        var id = replicationController.id;
        var namespace = replicationController.namespace || "";
        KubernetesApiURL.then(function (KubernetesApiURL) {
            var url = kubernetesUrlForKind(KubernetesApiURL, "ReplicationController", namespace, id);
            $http.get(url).success(function (data, status, headers, config) {
                if (data) {
                    var desiredState = data.desiredState;
                    if (!desiredState) {
                        desiredState = {};
                        data.desiredState = desiredState;
                    }
                    desiredState.replicas = newReplicas;
                    $http.put(url, data).success(function (data, status, headers, config) {
                        Kubernetes.log.debug("updated controller " + url);
                        if (angular.isFunction(onCompleteFn)) {
                            onCompleteFn();
                        }
                    }).error(function (data, status, headers, config) {
                        Kubernetes.log.warn("Failed to save " + url + " " + data + " " + status);
                    });
                }
            }).error(function (data, status, headers, config) {
                Kubernetes.log.warn("Failed to load " + url + " " + data + " " + status);
            });
        }, function (response) {
            Kubernetes.log.debug("Failed to get rest API URL, can't resize controller " + id + " resource: ", response);
        });
    }
    Kubernetes.resizeController = resizeController;
    function statusTextToCssClass(text) {
        if (text) {
            var lower = text.toLowerCase();
            if (lower.startsWith("run") || lower.startsWith("ok")) {
                return 'fa fa-play-circle green';
            }
            else if (lower.startsWith("wait")) {
                return 'fa fa-download';
            }
            else if (lower.startsWith("term") || lower.startsWith("error") || lower.startsWith("fail")) {
                return 'fa fa-off orange';
            }
        }
        return 'fa fa-question red';
    }
    Kubernetes.statusTextToCssClass = statusTextToCssClass;
    function podStatus(pod) {
        var currentStatus = (pod || {}).currentState || {};
        return currentStatus.status;
    }
    Kubernetes.podStatus = podStatus;
    function createAppViewPodCounters(appView) {
        var array = [];
        var map = {};
        var pods = appView.pods;
        var lowestDate = null;
        angular.forEach(pods, function (pod) {
            var selector = pod.labels;
            var selectorText = Kubernetes.labelsToString(selector, " ");
            var answer = map[selector];
            if (!answer) {
                answer = {
                    labelText: selectorText,
                    podsLink: Core.url("/kubernetes/pods?q=" + encodeURIComponent(selectorText)),
                    valid: 0,
                    waiting: 0,
                    error: 0
                };
                map[selector] = answer;
                array.push(answer);
            }
            var status = (podStatus(pod) || "Error").toLowerCase();
            if (status.startsWith("run") || status.startsWith("ok")) {
                answer.valid += 1;
            }
            else if (status.startsWith("wait")) {
                answer.waiting += 1;
            }
            else {
                answer.error += 1;
            }
            var creationTimestamp = pod.creationTimestamp;
            if (creationTimestamp) {
                var d = new Date(creationTimestamp);
                if (!lowestDate || d < lowestDate) {
                    lowestDate = d;
                }
            }
        });
        appView.$creationDate = lowestDate;
        return array;
    }
    Kubernetes.createAppViewPodCounters = createAppViewPodCounters;
    function createAppViewServiceViews(appView) {
        var array = [];
        var pods = appView.pods;
        angular.forEach(pods, function (pod) {
            var id = pod.id;
            if (id) {
                var abbrev = id;
                var idx = id.indexOf("-");
                if (idx > 1) {
                    abbrev = id.substring(0, idx);
                }
                pod.idAbbrev = abbrev;
            }
            pod.statusClass = statusTextToCssClass(podStatus(pod));
        });
        var services = appView.services || [];
        var replicationControllers = appView.replicationControllers || [];
        var size = Math.max(services.length, replicationControllers.length, 1);
        var appName = appView.$info.name;
        for (var i = 0; i < size; i++) {
            var service = services[i];
            var replicationController = replicationControllers[i];
            var controllerId = (replicationController || {}).id;
            var name = (service || {}).id || controllerId;
            var address = (service || {}).portalIP;
            if (!name && pods.length) {
                name = pods[0].idAbbrev;
            }
            if (!appView.$info.name) {
                appView.$info.name = name;
            }
            if (!appView.id && pods.length) {
                appView.id = pods[0].id;
            }
            if (i > 0) {
                appName = name;
            }
            var podCount = pods.length;
            var podCountText = podCount + " pod" + (podCount > 1 ? "s" : "");
            var view = {
                appName: appName || name,
                name: name,
                createdDate: appView.$creationDate,
                podCountText: podCountText,
                address: address,
                controllerId: controllerId,
                service: service,
                replicationController: replicationController,
                pods: pods
            };
            array.push(view);
        }
        return array;
    }
    Kubernetes.createAppViewServiceViews = createAppViewServiceViews;
    /**
     * converts a git path into an accessible URL for the browser
     */
    function gitPathToUrl(iconPath, branch) {
        if (branch === void 0) { branch = "master"; }
        return (HawtioCore.injector.get('AppLibraryURL') || '') + "/git/" + branch + iconPath;
    }
    Kubernetes.gitPathToUrl = gitPathToUrl;
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
var Kubernetes;
(function (Kubernetes) {
    function byId(thing) {
        return thing.id;
    }
    function createKey(namespace, id) {
        return (namespace || "") + "-" + id;
    }
    function populateKey(item) {
        var result = item;
        result['_key'] = createKey(item.namespace, item.id);
        return result;
    }
    function populateKeys(items) {
        var result = [];
        angular.forEach(items, function (item) {
            result.push(populateKey(item));
        });
        return result;
    }
    function selectPods(pods, namespace, labels) {
        return pods.filter(function (pod) {
            return pod.namespace === namespace && Kubernetes.selectorMatches(labels, pod.labels);
        });
    }
    /**
     * The object which keeps track of all the pods, replication controllers, services and their associations
     */
    var KubernetesModelService = (function () {
        function KubernetesModelService() {
            this.kubernetes = null;
            this.apps = [];
            this.services = [];
            this.replicationControllers = [];
            this.pods = [];
            this.hosts = [];
            this.namespaces = [];
            this.redraw = false;
            this.resourceVersions = {};
            // various views on the data
            this.podsByHost = {};
            this.servicesByKey = {};
            this.replicationControllersByKey = {};
            this.podsByKey = {};
            this.appInfos = [];
            this.appViews = [];
            this.appFolders = [];
            this.fetched = false;
            this.fetch = function () {
            };
        }
        KubernetesModelService.prototype.$keepPolling = function () {
            return Kubernetes.keepPollingModel;
        };
        KubernetesModelService.prototype.orRedraw = function (flag) {
            this.redraw = this.redraw || flag;
        };
        KubernetesModelService.prototype.getService = function (namespace, id) {
            return this.servicesByKey[createKey(namespace, id)];
        };
        KubernetesModelService.prototype.getReplicationController = function (namespace, id) {
            return this.replicationControllersByKey[createKey(namespace, id)];
        };
        KubernetesModelService.prototype.getPod = function (namespace, id) {
            return this.podsByKey[createKey(namespace, id)];
        };
        KubernetesModelService.prototype.updateIconUrlAndAppInfo = function (entity, nameField) {
            var answer = null;
            var id = entity.id;
            if (id && nameField) {
                (this.appInfos || []).forEach(function (appInfo) {
                    var iconPath = appInfo.iconPath;
                    if (iconPath && !answer) {
                        var iconUrl = Kubernetes.gitPathToUrl(iconPath);
                        var ids = Core.pathGet(appInfo, ["names", nameField]);
                        angular.forEach(ids, function (appId) {
                            if (appId === id) {
                                entity.$iconUrl = iconUrl;
                                entity.appPath = appInfo.appPath;
                                entity.$info = appInfo;
                            }
                        });
                    }
                });
            }
            if (!entity.$iconUrl) {
                entity.$iconUrl = Kubernetes.defaultIconUrl;
            }
        };
        KubernetesModelService.prototype.maybeInit = function () {
            var _this = this;
            this.fetched = true;
            if (this.services && this.replicationControllers && this.pods) {
                this.servicesByKey = {};
                this.podsByKey = {};
                this.replicationControllersByKey = {};
                var podsByHost = {};
                this.pods.forEach(function (pod) {
                    if (!pod.kind)
                        pod.kind = "Pod";
                    _this.podsByKey[pod._key] = pod;
                    var host = pod.currentState.host;
                    podsByHost[host] = podsByHost[host] || [];
                    podsByHost[host].push(pod);
                    pod.$labelsText = Kubernetes.labelsToString(pod.labels);
                    if (host) {
                        pod.$labelsText += Kubernetes.labelFilterTextSeparator + "host=" + host;
                    }
                    pod.$iconUrl = Kubernetes.defaultIconUrl;
                    _this.discoverPodConnections(pod);
                    pod.$containerPorts = [];
                    angular.forEach(Core.pathGet(pod, ["desiredState", "manifest", "containers"]), function (container) {
                        angular.forEach(container.ports, function (port) {
                            var containerPort = port.containerPort;
                            if (containerPort) {
                                pod.$containerPorts.push(containerPort);
                            }
                        });
                    });
                });
                this.services.forEach(function (service) {
                    if (!service.kind)
                        service.kind = "Service";
                    _this.servicesByKey[service._key] = service;
                    var selector = service.selector;
                    service.$pods = [];
                    service.$podCounters = selector ? Kubernetes.createPodCounters(selector, _this.pods, service.$pods) : null;
                    var selectedPods = service.$pods;
                    service.connectTo = selectedPods.map(function (pod) {
                        return pod._key;
                    }).join(',');
                    service.$labelsText = Kubernetes.labelsToString(service.labels);
                    _this.updateIconUrlAndAppInfo(service, "serviceNames");
                    var iconUrl = service.$iconUrl;
                    if (iconUrl && selectedPods) {
                        selectedPods.forEach(function (pod) {
                            pod.$iconUrl = iconUrl;
                        });
                    }
                });
                this.replicationControllers.forEach(function (replicationController) {
                    if (!replicationController.kind)
                        replicationController.kind = "ReplicationController";
                    _this.replicationControllersByKey[replicationController._key] = replicationController;
                    var selector = replicationController.desiredState.replicaSelector;
                    replicationController.$pods = [];
                    replicationController.$podCounters = selector ? Kubernetes.createPodCounters(selector, _this.pods, replicationController.$pods) : null;
                    var selectedPods = replicationController.$pods;
                    replicationController.connectTo = selectedPods.map(function (pod) {
                        return pod._key;
                    }).join(',');
                    replicationController.$labelsText = Kubernetes.labelsToString(replicationController.labels);
                    _this.updateIconUrlAndAppInfo(replicationController, "replicationControllerNames");
                    var iconUrl = replicationController.$iconUrl;
                    if (iconUrl && selectedPods) {
                        selectedPods.forEach(function (pod) {
                            pod.$iconUrl = iconUrl;
                        });
                    }
                });
                var tmpHosts = [];
                this.podsByHost = podsByHost;
                for (var hostKey in podsByHost) {
                    var hostPods = [];
                    var podCounters = Kubernetes.createPodCounters(function (pod) { return (pod.currentState || {}).host === hostKey; }, this.pods, hostPods, "host=" + hostKey);
                    var hostIP = null;
                    if (hostPods.length) {
                        var pod = hostPods[0];
                        var currentState = pod.currentState;
                        if (currentState) {
                            hostIP = currentState.hostIP;
                        }
                    }
                    var hostDetails = {
                        id: hostKey,
                        hostIP: hostIP,
                        pods: hostPods,
                        kind: "Host",
                        $podCounters: podCounters,
                        $iconUrl: Kubernetes.hostIconUrl
                    };
                    tmpHosts.push(hostDetails);
                }
                this.orRedraw(ArrayHelpers.removeElements(this.hosts, tmpHosts));
                tmpHosts.forEach(function (newHost) {
                    var oldHost = _this.hosts.find(function (h) {
                        return h.id === newHost.id;
                    });
                    if (!oldHost) {
                        _this.redraw = true;
                        _this.hosts.push(newHost);
                    }
                    else {
                        _this.orRedraw(ArrayHelpers.sync(oldHost.pods, newHost.pods));
                    }
                });
                this.updateApps();
                Kubernetes.updateNamespaces(this.kubernetes, this.pods, this.replicationControllers, this.services);
            }
        };
        KubernetesModelService.prototype.updateApps = function () {
            // lets create the app views by trying to join controllers / services / pods that are related
            var appViews = [];
            this.replicationControllers.forEach(function (replicationController) {
                var name = replicationController.name || replicationController.id;
                var $iconUrl = replicationController.$iconUrl;
                appViews.push({
                    appPath: "/dummyPath/" + name,
                    $name: name,
                    $info: {
                        $iconUrl: $iconUrl
                    },
                    $iconUrl: $iconUrl,
                    replicationControllers: [replicationController],
                    pods: replicationController.$pods || [],
                    services: []
                });
            });
            this.services.forEach(function (service) {
                // now lets see if we can find an app with an RC of the same selector
                var matchesApp = null;
                appViews.forEach(function (appView) {
                    appView.replicationControllers.forEach(function (replicationController) {
                        var repSelector = Core.pathGet(replicationController, ["desiredState", "replicaSelector"]);
                        if (repSelector && Kubernetes.selectorMatches(repSelector, service.selector) && service.namespace == replicationController.namespace) {
                            matchesApp = appView;
                        }
                    });
                });
                if (matchesApp) {
                    matchesApp.services.push(service);
                }
                else {
                    var name = service.name || service.id;
                    var $iconUrl = service.$iconUrl;
                    appViews.push({
                        appPath: "/dummyPath/" + name,
                        $name: name,
                        $info: {
                            $iconUrl: $iconUrl
                        },
                        $iconUrl: $iconUrl,
                        replicationControllers: [],
                        pods: service.$pods || [],
                        services: [service]
                    });
                }
            });
            this.appViews = appViews;
            if (this.appInfos && this.appViews) {
                var folderMap = {};
                var folders = [];
                var appMap = {};
                angular.forEach(this.appInfos, function (appInfo) {
                    if (!appInfo.$iconUrl) {
                        appInfo.$iconUrl = Kubernetes.gitPathToUrl(appInfo.iconPath);
                    }
                    var appPath = appInfo.appPath;
                    if (appPath) {
                        appMap[appPath] = appInfo;
                        var idx = appPath.lastIndexOf("/");
                        var folderPath = "";
                        if (idx >= 0) {
                            folderPath = appPath.substring(0, idx);
                        }
                        folderPath = Core.trimLeading(folderPath, "/");
                        var folder = folderMap[folderPath];
                        if (!folder) {
                            folder = {
                                path: folderPath,
                                expanded: true,
                                apps: []
                            };
                            folders.push(folder);
                            folderMap[folderPath] = folder;
                        }
                        folder.apps.push(appInfo);
                    }
                });
                this.appFolders = folders.sortBy("path");
                var apps = [];
                var defaultInfo = {
                    $iconUrl: Kubernetes.defaultIconUrl
                };
                angular.forEach(this.appViews, function (appView) {
                    var appPath = appView.appPath;
                    /*
                     TODO
                     appView.$select = () => {
                     Kubernetes.setJson($scope, appView.id, $scope.model.apps);
                     };
                     */
                    var appInfo = angular.copy(defaultInfo);
                    if (appPath) {
                        appInfo = appMap[appPath] || appInfo;
                    }
                    if (!appView.$info) {
                        appView.$info = defaultInfo;
                        appView.$info = appInfo;
                    }
                    appView.id = appPath;
                    if (!appView.$name) {
                        appView.$name = appInfo.name || appView.$name;
                    }
                    if (!appView.$iconUrl) {
                        appView.$iconUrl = appInfo.$iconUrl;
                    }
                    apps.push(appView);
                    appView.$podCounters = Kubernetes.createAppViewPodCounters(appView);
                    appView.$serviceViews = Kubernetes.createAppViewServiceViews(appView);
                });
                //this.apps = apps;
                this.apps = this.appViews;
            }
        };
        KubernetesModelService.prototype.discoverPodConnections = function (entity) {
            var info = Core.pathGet(entity, ["currentState", "info"]);
            var hostPort = null;
            var currentState = entity.currentState || {};
            var desiredState = entity.desiredState || {};
            var podId = entity.id || entity.name;
            var host = currentState["host"];
            var podIP = currentState["podIP"];
            var hasDocker = false;
            var foundContainerPort = null;
            if (desiredState) {
                var containers = Core.pathGet(desiredState, ["manifest", "containers"]);
                angular.forEach(containers, function (container) {
                    if (!hostPort) {
                        var ports = container.ports;
                        angular.forEach(ports, function (port) {
                            if (!hostPort) {
                                var containerPort = port.containerPort;
                                var portName = port.name;
                                var containerHostPort = port.hostPort;
                                if (containerPort === 8778 || "jolokia" === portName) {
                                    if (containerPort) {
                                        if (podIP) {
                                            foundContainerPort = containerPort;
                                        }
                                        if (containerHostPort) {
                                            hostPort = containerHostPort;
                                        }
                                    }
                                }
                            }
                        });
                    }
                });
            }
            if (Kubernetes.isRunning(currentState) && podId && foundContainerPort) {
                entity.$jolokiaUrl = "/kubernetes/api/" + Kubernetes.defaultApiVersion + "/proxy/pods/" + podId + ":" + foundContainerPort + "/jolokia/";
            }
        };
        return KubernetesModelService;
    })();
    Kubernetes.KubernetesModelService = KubernetesModelService;
    /**
     * Creates a model service which keeps track of all the pods, replication controllers and services along
     * with their associations and status
     */
    function createKubernetesModel($rootScope, $http, AppLibraryURL, KubernetesApiURL, KubernetesState, KubernetesServices, KubernetesReplicationControllers, KubernetesPods) {
        var $scope = new KubernetesModelService();
        $scope.kubernetes = KubernetesState;
        KubernetesServices.then(function (KubernetesServices) {
            KubernetesReplicationControllers.then(function (KubernetesReplicationControllers) {
                KubernetesPods.then(function (KubernetesPods) {
                    $scope.fetch = PollHelpers.setupPolling($scope, function (next) {
                        var ready = 0;
                        var numServices = 4;
                        var dataChanged = false;
                        var changedResourceVersion = null;
                        function maybeNext(count) {
                            ready = count;
                            // log.debug("Completed: ", ready);
                            if (ready >= numServices) {
                                // log.debug("Fetching another round");
                                if (dataChanged) {
                                    Kubernetes.log.debug("kube model changed: resourceVersion: " + changedResourceVersion);
                                    $scope.maybeInit();
                                    $rootScope.$broadcast('kubernetesModelUpdated');
                                }
                                next();
                            }
                        }
                        function hasChanged(response, name) {
                            var resourceVersion = response.resourceVersion;
                            var lastResourceVersion = $scope.resourceVersions[name] || 0;
                            if (!resourceVersion || resourceVersion > lastResourceVersion) {
                                if (resourceVersion) {
                                    $scope.resourceVersions[name] = resourceVersion;
                                    changedResourceVersion = resourceVersion;
                                }
                                dataChanged = true;
                                return true;
                            }
                            return false;
                        }
                        KubernetesServices.query(function (response) {
                            if (response && hasChanged(response, "services")) {
                                var items = populateKeys((response.items || []).sortBy(byId));
                                angular.forEach(items, function (item) {
                                    Kubernetes.kubernetesProxyUrlForService(KubernetesApiURL, item).then(function (url) {
                                        item.proxyUrl = url;
                                    });
                                });
                                $scope.services = items;
                            }
                            maybeNext(ready + 1);
                        });
                        KubernetesReplicationControllers.query(function (response) {
                            if (response && hasChanged(response, "replicationControllers")) {
                                var items = populateKeys((response.items || []).sortBy(byId));
                                $scope.replicationControllers = items;
                            }
                            maybeNext(ready + 1);
                        });
                        KubernetesPods.query(function (response) {
                            if (response && hasChanged(response, "pods")) {
                                var items = populateKeys((response.items || []).sortBy(byId));
                                $scope.pods = items;
                            }
                            maybeNext(ready + 1);
                        });
                        var appsUrl = AppLibraryURL + "/apps";
                        var etags = $scope.resourceVersions["appLibrary"];
                        $http.get(appsUrl, {
                            headers: {
                                "If-None-Match": etags
                            }
                        }).success(function (data, status, headers, config) {
                            if (angular.isArray(data) && status === 200) {
                                var newETags = headers("etag") || headers("ETag");
                                if (!newETags || newETags !== etags) {
                                    if (newETags) {
                                        $scope.resourceVersions["appLibrary"] = newETags;
                                    }
                                    $scope.appInfos = data;
                                    dataChanged = true;
                                }
                            }
                            maybeNext(ready + 1);
                        }).error(function (data, status, headers, config) {
                            maybeNext(ready + 1);
                        });
                    });
                    $scope.fetch();
                });
            });
        });
        function selectPods(pods, namespace, labels) {
            return pods.filter(function (pod) {
                return pod.namespace === namespace && Kubernetes.selectorMatches(labels, pod.labels);
            });
        }
        return $scope;
    }
    Kubernetes.createKubernetesModel = createKubernetesModel;
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesModel.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes._module = angular.module(Kubernetes.pluginName, ['hawtio-core', 'hawtio-ui', 'wiki']);
    Kubernetes.controller = PluginHelpers.createControllerFunction(Kubernetes._module, Kubernetes.pluginName);
    Kubernetes.route = PluginHelpers.createRoutingFunction(Kubernetes.templatePath);
    Kubernetes._module.config(['$routeProvider', function ($routeProvider) {
        $routeProvider.when(UrlHelpers.join(Kubernetes.context, '/pods'), Kubernetes.route('pods.html', false)).when(UrlHelpers.join(Kubernetes.context, '/namespace/:namespace/pods'), Kubernetes.route('pods.html', false)).when(UrlHelpers.join(Kubernetes.context, '/namespace/:namespace/pods/:id'), Kubernetes.route('pod.html', false)).when(UrlHelpers.join(Kubernetes.context, 'replicationControllers'), Kubernetes.route('replicationControllers.html', false)).when(UrlHelpers.join(Kubernetes.context, '/namespace/:namespace/replicationControllers'), Kubernetes.route('replicationControllers.html', false)).when(UrlHelpers.join(Kubernetes.context, '/namespace/:namespace/replicationControllers/:id'), Kubernetes.route('replicationController.html', false)).when(UrlHelpers.join(Kubernetes.context, 'services'), Kubernetes.route('services.html', false)).when(UrlHelpers.join(Kubernetes.context, '/namespace/:namespace/services'), Kubernetes.route('services.html', false)).when(UrlHelpers.join(Kubernetes.context, '/namespace/:namespace/services/:id'), Kubernetes.route('service.html', false)).when(UrlHelpers.join(Kubernetes.context, 'apps'), Kubernetes.route('apps.html', false)).when(UrlHelpers.join(Kubernetes.context, 'apps/:namespace'), Kubernetes.route('apps.html', false)).when(UrlHelpers.join(Kubernetes.context, 'hosts'), Kubernetes.route('hosts.html', false)).when(UrlHelpers.join(Kubernetes.context, 'hosts/:id'), Kubernetes.route('host.html', true)).when(UrlHelpers.join(Kubernetes.context, 'overview'), Kubernetes.route('overview.html', true)).when(Kubernetes.context, { redirectTo: UrlHelpers.join(Kubernetes.context, 'apps') });
    }]);
    // set up a promise that supplies the API URL for Kubernetes, proxied if necessary
    Kubernetes._module.factory('KubernetesApiURL', ['jolokiaUrl', 'jolokia', '$q', '$rootScope', function (jolokiaUrl, jolokia, $q, $rootScope) {
        var url = "/kubernetes/";
        var answer = $q.defer();
        answer.resolve(url);
        return answer.promise;
    }]);
    Kubernetes._module.factory('AppLibraryURL', ['$rootScope', function ($rootScope) {
        return "/kubernetes/api/" + Kubernetes.defaultApiVersion + "/proxy/services/app-library";
    }]);
    Kubernetes._module.factory('ConnectDialogService', ['$rootScope', function ($rootScope) {
        return {
            dialog: new UI.Dialog(),
            saveCredentials: false,
            userName: null,
            password: null,
            jolokiaUrl: null,
            containerName: null,
            view: null
        };
    }]);
    Kubernetes._module.filter('kubernetesPageLink', function () { return Kubernetes.entityPageLink; });
    function createResource(deferred, thing, urlTemplate, $rootScope, $resource, KubernetesApiURL) {
        KubernetesApiURL.then(function (KubernetesApiURL) {
            var url = UrlHelpers.escapeColons(KubernetesApiURL);
            Kubernetes.log.debug("Url for ", thing, ": ", url);
            var resource = $resource(UrlHelpers.join(url, urlTemplate), null, {
                query: { method: 'GET', isArray: false },
                save: { method: 'PUT', params: { id: '@id' } }
            });
            deferred.resolve(resource);
            Core.$apply($rootScope);
        }, function (response) {
            Kubernetes.log.debug("Failed to get rest API URL, can't create " + thing + " resource: ", response);
            deferred.reject(response);
            Core.$apply($rootScope);
        });
    }
    Kubernetes._module.factory('KubernetesVersion', ['$q', '$rootScope', '$resource', 'KubernetesApiURL', function ($q, $rootScope, $resource, KubernetesApiURL) {
        var answer = $q.defer();
        createResource(answer, 'pods', '/version', $rootScope, $resource, KubernetesApiURL);
        return answer.promise;
    }]);
    Kubernetes._module.factory('KubernetesPods', ['$q', '$rootScope', '$resource', 'KubernetesApiURL', function ($q, $rootScope, $resource, KubernetesApiURL) {
        var answer = $q.defer();
        createResource(answer, 'pods', '/api/' + Kubernetes.defaultApiVersion + '/pods/:id', $rootScope, $resource, KubernetesApiURL);
        return answer.promise;
    }]);
    Kubernetes._module.factory('KubernetesReplicationControllers', ['$q', '$rootScope', '$resource', 'KubernetesApiURL', function ($q, $rootScope, $resource, KubernetesApiURL) {
        var answer = $q.defer();
        createResource(answer, 'replication controllers', '/api/' + Kubernetes.defaultApiVersion + '/replicationControllers/:id', $rootScope, $resource, KubernetesApiURL);
        return answer.promise;
    }]);
    Kubernetes._module.factory('KubernetesServices', ['$q', '$rootScope', '$resource', 'KubernetesApiURL', function ($q, $rootScope, $resource, KubernetesApiURL) {
        var answer = $q.defer();
        createResource(answer, 'services', '/api/' + Kubernetes.defaultApiVersion + '/services/:id', $rootScope, $resource, KubernetesApiURL);
        return answer.promise;
    }]);
    Kubernetes._module.factory('KubernetesState', [function () {
        return {
            namespaces: [],
            selectedNamespace: null
        };
    }]);
    Kubernetes._module.factory('KubernetesModel', ['$rootScope', '$http', 'AppLibraryURL', 'KubernetesApiURL', 'KubernetesState', 'KubernetesServices', 'KubernetesReplicationControllers', 'KubernetesPods', function ($rootScope, $http, AppLibraryURL, KubernetesApiURL, KubernetesState, KubernetesServices, KubernetesReplicationControllers, KubernetesPods) {
        return Kubernetes.createKubernetesModel($rootScope, $http, AppLibraryURL, KubernetesApiURL, KubernetesState, KubernetesServices, KubernetesReplicationControllers, KubernetesPods);
    }]);
    Kubernetes._module.run(['viewRegistry', 'workspace', 'ServiceRegistry', 'HawtioNav', function (viewRegistry, workspace, ServiceRegistry, HawtioNav) {
        Kubernetes.log.debug("Running");
        viewRegistry['kubernetes'] = Kubernetes.templatePath + 'layoutKubernetes.html';
        var builder = HawtioNav.builder();
        var apps = builder.id('kube-apps').href(function () { return UrlHelpers.join(Kubernetes.context, 'apps'); }).title(function () { return 'Apps'; }).build();
        var services = builder.id('kube-services').href(function () { return UrlHelpers.join(Kubernetes.context, 'services'); }).title(function () { return 'Services'; }).build();
        var controllers = builder.id('kube-controllers').href(function () { return UrlHelpers.join(Kubernetes.context, 'replicationControllers'); }).title(function () { return 'Controllers'; }).build();
        var pods = builder.id('kube-pods').href(function () { return UrlHelpers.join(Kubernetes.context, 'pods'); }).title(function () { return 'Pods'; }).build();
        var hosts = builder.id('kube-hosts').href(function () { return UrlHelpers.join(Kubernetes.context, 'hosts'); }).title(function () { return 'Hosts'; }).build();
        var overview = builder.id('kube-overview').href(function () { return UrlHelpers.join(Kubernetes.context, 'overview'); }).title(function () { return 'Diagram'; }).build();
        var mainTab = builder.id('kubernetes').rank(100).defaultPage({
            rank: 100,
            isValid: function (yes, no) {
                // TODO not sure if we need the tree loaded for this
                var name = 'KubernetesDefaultPage';
                workspace.addNamedTreePostProcessor(name, function (tree) {
                    workspace.removeNamedTreePostProcessor(name);
                    if (!Core.isRemoteConnection() && Kubernetes.isKubernetes(workspace)) {
                        yes();
                    }
                    else {
                        no();
                    }
                });
            }
        }).href(function () { return Kubernetes.context; }).title(function () { return 'Kubernetes'; }).isValid(function () { return Kubernetes.isKubernetes(workspace); }).tabs(apps, services, controllers, pods, hosts, overview).build();
        HawtioNav.add(mainTab);
        // lets disable connect
        var navItems = HawtioNav.items || [];
        var connect = navItems.find(function (item) { return item.id === "jvm"; });
        if (connect) {
            connect.isValid = function () { return false; };
        }
        // images plugin doesn't work yet...
        var dockerRegistry = navItems.find(function (item) { return item.id === "docker-registry"; });
        if (dockerRegistry) {
            dockerRegistry.isValid = function () { return false; };
        }
        /*
        workspace.topLevelTabs.push({
          id: 'kubernetes',
          content: 'Kubernetes',
          isValid: (workspace:Core.Workspace) => isKubernetes(workspace),
          isActive: (workspace:Core.Workspace) => workspace.isLinkActive('kubernetes'),
          href: () => defaultRoute
        });
        */
        workspace.topLevelTabs.push({
            id: 'kibana',
            content: 'Logs',
            title: 'View and search all logs across all containers using Kibana and ElasticSearch',
            isValid: function (workspace) { return Service.hasService(ServiceRegistry, "kibana-service"); },
            href: function () { return Kubernetes.kibanaLogsLink(ServiceRegistry); },
            isActive: function (workspace) { return false; }
        });
        workspace.topLevelTabs.push({
            id: 'grafana',
            content: 'Metrics',
            title: 'Views metrics across all containers using Grafana and InfluxDB',
            isValid: function (workspace) { return Service.hasService(ServiceRegistry, "grafana-service"); },
            href: function () { return Service.serviceLink(ServiceRegistry, "grafana-service"); },
            isActive: function (workspace) { return false; }
        });
    }]);
    hawtioPluginLoader.addModule(Kubernetes.pluginName);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.Apps = Kubernetes.controller("Apps", ["$scope", "KubernetesModel", "KubernetesServices", "KubernetesReplicationControllers", "KubernetesPods", "KubernetesState", "KubernetesApiURL", "$templateCache", "$location", "$routeParams", "$http", "$dialog", "$timeout", "workspace", "jolokia", function ($scope, KubernetesModel, KubernetesServices, KubernetesReplicationControllers, KubernetesPods, KubernetesState, KubernetesApiURL, $templateCache, $location, $routeParams, $http, $dialog, $timeout, workspace, jolokia) {
        $scope.model = KubernetesModel;
        $scope.$on('kubernetesModelUpdated', function () {
            Core.$apply($scope);
        });
        $scope.apps = [];
        $scope.allApps = [];
        $scope.kubernetes = KubernetesState;
        $scope.fetched = false;
        $scope.json = '';
        ControllerHelpers.bindModelToSearchParam($scope, $location, 'id', '_id', undefined);
        ControllerHelpers.bindModelToSearchParam($scope, $location, 'appSelectorShow', 'openApp', undefined);
        ControllerHelpers.bindModelToSearchParam($scope, $location, 'mode', 'mode', 'detail');
        var branch = $scope.branch || "master";
        var namespace = null;
        function appMatches(app) {
            var filterText = $scope.appSelector.filterText;
            if (filterText) {
                return Core.matchFilterIgnoreCase(app.groupId, filterText) || Core.matchFilterIgnoreCase(app.artifactId, filterText) || Core.matchFilterIgnoreCase(app.name, filterText) || Core.matchFilterIgnoreCase(app.description, filterText);
            }
            else {
                return true;
            }
        }
        function appRunning(app) {
            return $scope.model.apps.any(function (running) { return running.appPath === app.appPath; });
        }
        $scope.tableConfig = {
            data: 'model.apps',
            showSelectionCheckbox: true,
            enableRowClickSelection: false,
            multiSelect: true,
            selectedItems: [],
            filterOptions: {
                filterText: $location.search()["q"] || ''
            },
            columnDefs: [
                { field: 'icon', displayName: 'App', cellTemplate: $templateCache.get("appIconTemplate.html") },
                { field: 'services', displayName: 'Services', cellTemplate: $templateCache.get("appServicesTemplate.html") },
                { field: 'replicationControllers', displayName: 'Controllers', cellTemplate: $templateCache.get("appReplicationControllerTemplate.html") },
                { field: '$podsLink', displayName: 'Pods', cellTemplate: $templateCache.get("appPodCountsAndLinkTemplate.html") },
                { field: '$deployedText', displayName: 'Deployed', cellTemplate: $templateCache.get("appDeployedTemplate.html") },
                { field: 'namespace', displayName: 'Namespace' }
            ]
        };
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        $scope.expandedPods = [];
        $scope.podExpanded = function (pod) {
            var id = (pod || {}).id;
            return id && ($scope.expandedPods || []).indexOf(id) >= 0;
        };
        $scope.expandPod = function (pod) {
            var id = pod.id;
            if (id) {
                $scope.expandedPods.push(id);
            }
        };
        $scope.collapsePod = function (pod) {
            var id = pod.id;
            if (id) {
                $scope.expandedPods = $scope.expandedPods.remove(function (v) { return id === v; });
            }
        };
        $scope.$on('$routeUpdate', function ($event) {
            Kubernetes.setJson($scope, $location.search()['_id'], $scope.model.apps);
        });
        function deleteApp(app, onCompleteFn) {
            function deleteServices(services, service, onCompletedFn) {
                if (!service || !services) {
                    return onCompletedFn();
                }
                var id = service.id;
                if (!id) {
                    Kubernetes.log.warn("No ID for service " + angular.toJson(service));
                }
                else {
                    KubernetesServices.then(function (KubernetesServices) {
                        KubernetesServices.delete({
                            id: id
                        }, undefined, function () {
                            Kubernetes.log.debug("Deleted service: ", id);
                            deleteServices(services, services.shift(), onCompletedFn);
                        }, function (error) {
                            Kubernetes.log.debug("Error deleting service: ", error);
                            deleteServices(services, services.shift(), onCompletedFn);
                        });
                    });
                }
            }
            function deleteReplicationControllers(replicationControllers, replicationController, onCompletedFn) {
                if (!replicationController || !replicationControllers) {
                    return onCompletedFn();
                }
                var id = replicationController.id;
                if (!id) {
                    Kubernetes.log.warn("No ID for replicationController " + angular.toJson(replicationController));
                }
                else {
                    KubernetesReplicationControllers.then(function (KubernetesReplicationControllers) {
                        KubernetesReplicationControllers.delete({
                            id: id
                        }, undefined, function () {
                            Kubernetes.log.debug("Deleted replicationController: ", id);
                            deleteReplicationControllers(replicationControllers, replicationControllers.shift(), onCompletedFn);
                        }, function (error) {
                            Kubernetes.log.debug("Error deleting replicationController: ", error);
                            deleteReplicationControllers(replicationControllers, replicationControllers.shift(), onCompletedFn);
                        });
                    });
                }
            }
            function deletePods(pods, pod, onCompletedFn) {
                if (!pod || !pods) {
                    return onCompletedFn();
                }
                var id = pod.id;
                if (!id) {
                    Kubernetes.log.warn("No ID for pod " + angular.toJson(pod));
                }
                else {
                    KubernetesPods.then(function (KubernetesPods) {
                        KubernetesPods.delete({
                            id: id
                        }, undefined, function () {
                            Kubernetes.log.debug("Deleted pod: ", id);
                            deletePods(pods, pods.shift(), onCompletedFn);
                        }, function (error) {
                            Kubernetes.log.debug("Error deleting pod: ", error);
                            deletePods(pods, pods.shift(), onCompletedFn);
                        });
                    });
                }
            }
            var services = [].concat(app.services);
            deleteServices(services, services.shift(), function () {
                var replicationControllers = [].concat(app.replicationControllers);
                deleteReplicationControllers(replicationControllers, replicationControllers.shift(), function () {
                    var pods = [].concat(app.pods);
                    deletePods(pods, pods.shift(), onCompleteFn);
                });
            });
        }
        $scope.deletePrompt = function (selected) {
            if (angular.isString(selected)) {
                selected = [{
                    id: selected
                }];
            }
            UI.multiItemConfirmActionDialog({
                collection: selected,
                index: '$name',
                onClose: function (result) {
                    if (result) {
                        function deleteSelected(selected, next) {
                            if (next) {
                                var id = next.name;
                                Kubernetes.log.debug("deleting: ", id);
                                deleteApp(next, function () {
                                    Kubernetes.log.debug("deleted: ", id);
                                    deleteSelected(selected, selected.shift());
                                });
                            }
                        }
                        deleteSelected(selected, selected.shift());
                    }
                },
                title: 'Delete Apps?',
                action: 'The following Apps will be deleted:',
                okText: 'Delete',
                okClass: 'btn-danger',
                custom: "This operation is permanent once completed!",
                customClass: "alert alert-warning"
            }).open();
        };
        $scope.appSelector = {
            filterText: "",
            folders: [],
            selectedApps: [],
            isOpen: function (folder) {
                if ($scope.appSelector.filterText !== '' || folder.expanded) {
                    return "opened";
                }
                return "closed";
            },
            getSelectedClass: function (app) {
                if (app.abstract) {
                    return "abstract";
                }
                if (app.selected) {
                    return "selected";
                }
                return "";
            },
            showApp: function (app) {
                return appMatches(app) && !appRunning(app);
            },
            showFolder: function (folder) {
                return !$scope.appSelector.filterText || folder.apps.some(function (app) { return appMatches(app) && !appRunning(app); });
            },
            clearSelected: function () {
                angular.forEach($scope.model.appFolders, function (folder) {
                    angular.forEach(folder.apps, function (app) {
                        app.selected = false;
                    });
                });
                $scope.appSelector.selectedApps = [];
                Core.$apply($scope);
            },
            updateSelected: function () {
                // lets update the selected apps
                var selectedApps = [];
                angular.forEach($scope.model.appFolders, function (folder) {
                    var apps = folder.apps.filter(function (app) { return app.selected; });
                    if (apps) {
                        selectedApps = selectedApps.concat(apps);
                    }
                });
                $scope.appSelector.selectedApps = selectedApps.sortBy("name");
            },
            select: function (app, flag) {
                app.selected = flag;
                $scope.appSelector.updateSelected();
            },
            hasSelection: function () {
                return $scope.model.appFolders.any(function (folder) { return folder.apps.any(function (app) { return app.selected; }); });
            },
            runSelectedApps: function () {
                // lets run all the selected apps
                angular.forEach($scope.appSelector.selectedApps, function (app) {
                    var name = app.name;
                    var metadataPath = app.metadataPath;
                    if (metadataPath) {
                        // lets load the json/yaml
                        //var url = gitPathToUrl(Wiki.gitRelativeURL(branch, metadataPath));
                        var url = Kubernetes.gitPathToUrl(metadataPath, branch);
                        if (url) {
                            $http.get(url).success(function (data, status, headers, config) {
                                if (data) {
                                    // lets convert the json object structure into a string
                                    var json = angular.toJson(data);
                                    var fn = function () {
                                    };
                                    Kubernetes.runApp($location, $scope, $http, KubernetesApiURL, json, name, fn, namespace);
                                }
                            }).error(function (data, status, headers, config) {
                                $scope.summaryHtml = null;
                                Kubernetes.log.warn("Failed to load " + url + " " + data + " " + status);
                            });
                        }
                    }
                });
                // lets go back to the apps view
                $scope.appSelector.clearSelected();
                $scope.appSelectorShow = false;
            }
        };
        ;
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    // controller for connecting to a remote container via jolokia
    Kubernetes.ConnectController = Kubernetes.controller("ConnectController", [
        "$scope",
        "localStorage",
        "userDetails",
        "ConnectDialogService",
        function ($scope, localStorage, userDetails, ConnectDialogService) {
            $scope.connect = ConnectDialogService;
            $scope.onOK = function () {
                var userName = $scope.connect.userName;
                var password = $scope.connect.password;
                if (!userDetails.password) {
                    // this can get unset if the user happens to refresh and hasn't checked rememberMe
                    userDetails.password = password;
                }
                if ($scope.connect.saveCredentials) {
                    $scope.connect.saveCredentials = false;
                    if (userName) {
                        localStorage['kuberentes.userName'] = userName;
                    }
                    if (password) {
                        localStorage['kuberentes.password'] = password;
                    }
                }
                Kubernetes.log.info("Connecting to " + $scope.connect.jolokiaUrl + " for container: " + $scope.connect.containerName + " user: " + $scope.connect.userName);
                var options = Core.createConnectOptions({
                    jolokiaUrl: $scope.connect.jolokiaUrl,
                    userName: userName,
                    password: password,
                    useProxy: true,
                    view: $scope.connect.view,
                    name: $scope.connect.containerName
                });
                Core.connectToServer(localStorage, options);
                setTimeout(function () {
                    $scope.connect.dialog.close();
                    Core.$apply($scope);
                }, 100);
            };
            $scope.doConnect = function (entity) {
                if (userDetails) {
                    $scope.connect.userName = userDetails.username;
                    $scope.connect.password = userDetails.password;
                }
                $scope.connect.jolokiaUrl = entity.$jolokiaUrl;
                $scope.connect.containerName = entity.id;
                //$scope.connect.view = "#/openlogs";
                var alwaysPrompt = localStorage['fabricAlwaysPrompt'];
                if ((alwaysPrompt && alwaysPrompt !== "false") || !$scope.connect.userName || !$scope.connect.password) {
                    $scope.connect.dialog.open();
                }
                else {
                    $scope.connect.onOK();
                }
            };
        }
    ]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.HostController = Kubernetes.controller("HostController", ["$scope", "KubernetesModel", "KubernetesState", "$templateCache", "$location", "$routeParams", "$http", "$timeout", "KubernetesApiURL", function ($scope, KubernetesModel, KubernetesState, $templateCache, $location, $routeParams, $http, $timeout, KubernetesApiURL) {
        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;
        $scope.itemConfig = {
            properties: {}
        };
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        $scope.$on('kubernetesModelUpdated', function () {
            updateData();
        });
        $scope.$on('$routeUpdate', function ($event) {
            updateData();
        });
        updateData();
        function updateData() {
            $scope.id = $routeParams["id"];
            $scope.item = null;
            if ($scope.id) {
                KubernetesApiURL.then(function (KubernetesApiURL) {
                    var url = UrlHelpers.join(KubernetesApiURL, "/api/" + Kubernetes.defaultApiVersion + "/" + "minions", $scope.id);
                    $http.get(url).success(function (data, status, headers, config) {
                        if (data) {
                            $scope.item = data;
                        }
                        Core.$apply($scope);
                    }).error(function (data, status, headers, config) {
                        Kubernetes.log.warn("Failed to load " + url + " " + data + " " + status);
                    });
                });
            }
            else {
                Core.$apply($scope);
            }
        }
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.HostsController = Kubernetes.controller("HostsController", ["$scope", "KubernetesModel", "KubernetesPods", "KubernetesState", "ServiceRegistry", "$dialog", "$window", "$templateCache", "$routeParams", "$location", "localStorage", "$http", "$timeout", "KubernetesApiURL", function ($scope, KubernetesModel, KubernetesPods, KubernetesState, ServiceRegistry, $dialog, $window, $templateCache, $routeParams, $location, localStorage, $http, $timeout, KubernetesApiURL) {
        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;
        $scope.$on('kubernetesModelUpdated', function () {
            Core.$apply($scope);
        });
        $scope.tableConfig = {
            data: 'model.hosts',
            showSelectionCheckbox: true,
            enableRowClickSelection: false,
            multiSelect: true,
            selectedItems: [],
            filterOptions: {
                filterText: $location.search()["q"] || ''
            },
            columnDefs: [
                {
                    field: 'id',
                    displayName: 'Name',
                    defaultSort: true,
                    cellTemplate: $templateCache.get("idTemplate.html")
                },
                {
                    field: 'hostIP',
                    displayName: 'IP'
                },
                { field: '$podsLink', displayName: 'Pods', cellTemplate: $templateCache.get("podCountsAndLinkTemplate.html") }
            ]
        };
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        KubernetesPods.then(function (KubernetesPods) {
            $scope.deletePrompt = function (selected) {
                if (angular.isString(selected)) {
                    selected = [{
                        id: selected
                    }];
                }
                UI.multiItemConfirmActionDialog({
                    collection: selected,
                    index: 'id',
                    onClose: function (result) {
                        if (result) {
                            function deleteSelected(selected, next) {
                                if (next) {
                                    Kubernetes.log.debug("deleting: ", next.id);
                                    KubernetesPods.delete({
                                        id: next.id
                                    }, undefined, function () {
                                        Kubernetes.log.debug("deleted: ", next.id);
                                        deleteSelected(selected, selected.shift());
                                    }, function (error) {
                                        Kubernetes.log.debug("Error deleting: ", error);
                                        deleteSelected(selected, selected.shift());
                                    });
                                }
                            }
                            deleteSelected(selected, selected.shift());
                        }
                    },
                    title: 'Delete pods?',
                    action: 'The following pods will be deleted:',
                    okText: 'Delete',
                    okClass: 'btn-danger',
                    custom: "This operation is permanent once completed!",
                    customClass: "alert alert-warning"
                }).open();
            };
        });
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.KubernetesJsonDirective = Kubernetes._module.directive("kubernetesJson", [function () {
        return {
            restrict: 'A',
            replace: true,
            templateUrl: Kubernetes.templatePath + 'kubernetesJsonDirective.html',
            scope: {
                config: '=kubernetesJson'
            },
            controller: ["$scope", "$location", "$http", "KubernetesApiURL", "marked", function ($scope, $location, $http, KubernetesApiURL, marked) {
                $scope.$watch('config', function (config) {
                    if (config) {
                        if (config.error) {
                            Kubernetes.log.debug("Error parsing kubernetes config: ", config.error);
                        }
                        else {
                            Kubernetes.log.debug("Got kubernetes configuration: ", config);
                        }
                    }
                    else {
                        Kubernetes.log.debug("Kubernetes config unset");
                    }
                });
                $scope.$on('Wiki.ViewPage.Children', function ($event, pageId, children) {
                    // log.debug("Got broadcast, pageId: ", pageId, " children: ", children);
                    $scope.appTitle = pageId;
                    if (children) {
                        var summaryFile = children.find(function (child) {
                            return child.name.toLowerCase() === "summary.md";
                        });
                        var summaryURL = null;
                        if (summaryFile) {
                            summaryURL = Wiki.gitRestURL(summaryFile.branch, summaryFile.path);
                            $http.get(summaryURL).success(function (data, status, headers, config) {
                                var summaryMarkdown = data;
                                if (summaryMarkdown) {
                                    $scope.summaryHtml = marked(summaryMarkdown);
                                }
                                else {
                                    $scope.summaryHtml = null;
                                }
                            }).error(function (data, status, headers, config) {
                                $scope.summaryHtml = null;
                                Kubernetes.log.warn("Failed to load " + summaryURL + " " + data + " " + status);
                            });
                        }
                        var iconFile = children.find(function (child) {
                            return child.name.toLowerCase().startsWith("icon");
                        });
                        if (iconFile) {
                            $scope.iconURL = Wiki.gitRestURL(iconFile.branch, iconFile.path);
                        }
                        var fabric8PropertiesFile = children.find(function (child) {
                            return child.name.toLowerCase() === "fabric8.properties";
                        });
                        var fabric8PropertiesURL = null;
                        if (fabric8PropertiesFile) {
                            fabric8PropertiesURL = Wiki.gitRestURL(fabric8PropertiesFile.branch, fabric8PropertiesFile.path);
                            $http.get(fabric8PropertiesURL).success(function (data, status, headers, config) {
                                var fabric8Properties = data;
                                if (fabric8Properties) {
                                    var nameRE = /(?:name)\s*=\s*(.+)[\n|$]/;
                                    var matches = fabric8Properties.match(nameRE);
                                    if (matches[1]) {
                                        $scope.displayName = matches[1].replace(/\\/g, '');
                                    }
                                }
                            }).error(function (data, status, headers, config) {
                                Kubernetes.log.warn("Failed to load " + fabric8PropertiesURL + " " + data + " " + status);
                            });
                        }
                    }
                });
                $scope.apply = function () {
                    var json = angular.toJson($scope.config);
                    var name = $scope.appTitle || "App";
                    Kubernetes.runApp($location, $scope, $http, KubernetesApiURL, json, name, function () {
                        // now lets navigate to the apps page so folks see things happen
                        $location.url("/kubernetes/apps");
                    });
                };
            }]
        };
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.FileDropController = Kubernetes.controller("FileDropController", ["$scope", "jolokiaUrl", "jolokia", "FileUploader", function ($scope, jolokiaUrl, jolokia, FileUploader) {
        $scope.uploader = new FileUploader({
            autoUpload: true,
            removeAfterUpload: true,
            url: jolokiaUrl
        });
        FileUpload.useJolokiaTransport($scope, $scope.uploader, jolokia, function (json) {
            Kubernetes.log.debug("Json: ", json);
            return {
                'type': 'exec',
                mbean: Kubernetes.managerMBean,
                operation: 'apply',
                arguments: [json]
            };
        });
        $scope.uploader.onBeforeItem = function (item) {
            Core.notification('info', 'Uploading ' + item);
        };
        $scope.uploader.onSuccessItem = function (item) {
            Kubernetes.log.debug("onSuccessItem: ", item);
        };
        $scope.uploader.onErrorItem = function (item, response, status) {
            Kubernetes.log.debug("Failed to apply, response: ", response, " status: ", status);
        };
    }]);
    Kubernetes.TopLevel = Kubernetes.controller("TopLevel", ["$scope", "workspace", "KubernetesVersion", "KubernetesState", function ($scope, workspace, KubernetesVersion, KubernetesState) {
        $scope.version = undefined;
        $scope.showAppView = Kubernetes.isAppView(workspace);
        $scope.isActive = function (href) {
            return workspace.isLinkActive(href);
        };
        $scope.kubernetes = KubernetesState;
        KubernetesVersion.then(function (KubernetesVersion) {
            KubernetesVersion.query(function (response) {
                $scope.version = response;
            });
        });
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    var OverviewDirective = Kubernetes._module.directive("kubernetesOverview", ["$templateCache", "$compile", "$interpolate", "$timeout", "$window", "KubernetesState", 'KubernetesModel', function ($templateCache, $compile, $interpolate, $timeout, $window, KubernetesState, KubernetesModel) {
        return {
            restrict: 'E',
            replace: true,
            link: function (scope, element, attr) {
                scope.model = KubernetesModel;
                element.css({ visibility: 'hidden' });
                scope.getEntity = function (type, key) {
                    switch (type) {
                        case 'host':
                            return scope.model.podsByHost[key];
                        case 'pod':
                            return scope.model.podsByKey[key];
                        case 'replicationController':
                            return scope.model.replicationControllersByKey[key];
                        case 'service':
                            return scope.model.servicesByKey[key];
                        default:
                            return undefined;
                    }
                };
                scope.kubernetes = KubernetesState;
                scope.customizeDefaultOptions = function (options) {
                    options.Endpoint = ['Blank', {}];
                };
                scope.mouseEnter = function ($event) {
                    if (scope.jsPlumb) {
                        angular.element($event.currentTarget).addClass("hovered");
                        scope.jsPlumb.getEndpoints($event.currentTarget).forEach(function (endpoint) {
                            endpoint.connections.forEach(function (connection) {
                                if (!connection.isHover()) {
                                    connection.setHover(true);
                                    connection.endpoints.forEach(function (e) {
                                        scope.mouseEnter({
                                            currentTarget: e.element
                                        });
                                    });
                                }
                            });
                        });
                    }
                };
                scope.mouseLeave = function ($event) {
                    if (scope.jsPlumb) {
                        angular.element($event.currentTarget).removeClass("hovered");
                        scope.jsPlumb.getEndpoints($event.currentTarget).forEach(function (endpoint) {
                            endpoint.connections.forEach(function (connection) {
                                if (connection.isHover()) {
                                    connection.setHover(false);
                                    connection.endpoints.forEach(function (e) {
                                        scope.mouseLeave({
                                            currentTarget: e.element
                                        });
                                    });
                                }
                            });
                        });
                    }
                };
                /*
                scope.customizeEndpointOptions = (jsPlumb, node, options) => {
                  var type = node.el.attr('data-type');
                  // log.debug("endpoint type: ", type);
                  switch (type) {
                    case 'pod':
                      break;
                    case 'service':
                      break;
                    case 'replicationController':
                      break;
                  }
                };
                */
                scope.customizeConnectionOptions = function (jsPlumb, edge, params, options) {
                    var type = edge.source.el.attr('data-type');
                    options.connector = ["Bezier", { curviness: 50, stub: 25, alwaysRespectStubs: true }];
                    params.paintStyle = {
                        lineWidth: 2,
                        strokeStyle: '#5555cc'
                    };
                    switch (type) {
                        case 'pod':
                            break;
                        case 'service':
                            params.anchors = [
                                ["ContinuousRight", {}],
                                ["ContinuousLeft", {}]
                            ];
                            break;
                        case 'replicationController':
                            params.anchors = [
                                ["Perimeter", { shape: "Circle" }],
                                ["ContinuousRight", {}]
                            ];
                            break;
                    }
                    //log.debug("connection source type: ", type);
                    return options;
                };
                function interpolate(template, config) {
                    return $interpolate(template)(config);
                }
                function createElement(template, thingName, thing) {
                    var config = {};
                    config[thingName] = thing;
                    return interpolate(template, config);
                }
                function createElements(template, thingName, things) {
                    return things.map(function (thing) {
                        return createElement(template, thingName, thing);
                    });
                }
                function appendNewElements(parentEl, template, thingName, things) {
                    things.forEach(function (thing) {
                        var key = thing['_key'] || thing['id'];
                        var existing = parentEl.find("#" + key);
                        if (!existing.length) {
                            parentEl.append($compile(createElement(template, thingName, thing))(scope));
                        }
                    });
                }
                function namespaceFilter(item) {
                    return item.namespace === scope.kubernetes.selectedNamespace;
                }
                function firstDraw() {
                    Kubernetes.log.debug("First draw");
                    var services = scope.model.services;
                    var replicationControllers = scope.model.replicationControllers;
                    var pods = scope.model.pods;
                    var hosts = scope.model.hosts;
                    // log.debug("hosts: ", scope.model.hosts);
                    var parentEl = angular.element($templateCache.get("overviewTemplate.html"));
                    var servicesEl = parentEl.find(".services");
                    var hostsEl = parentEl.find(".hosts");
                    var replicationControllersEl = parentEl.find(".replicationControllers");
                    servicesEl.append(createElements($templateCache.get("serviceTemplate.html"), 'service', services.filter(namespaceFilter)));
                    replicationControllersEl.append(createElements($templateCache.get("replicationControllerTemplate.html"), 'replicationController', replicationControllers.filter(namespaceFilter)));
                    hosts.forEach(function (host) {
                        var hostEl = angular.element(createElement($templateCache.get("hostTemplate.html"), 'host', host));
                        var podContainer = angular.element(hostEl.find('.pod-container'));
                        podContainer.append(createElements($templateCache.get("podTemplate.html"), "pod", host.pods.filter(namespaceFilter)));
                        hostsEl.append(hostEl);
                    });
                    //parentEl.append(createElements($templateCache.get("podTemplate.html"), 'pod', pods));
                    element.append($compile(parentEl)(scope));
                    $timeout(function () {
                        element.css({ visibility: 'visible' });
                    }, 250);
                }
                function update() {
                    scope.$emit('jsplumbDoWhileSuspended', function () {
                        Kubernetes.log.debug("Update");
                        var services = scope.model.services.filter(namespaceFilter);
                        var replicationControllers = scope.model.replicationControllers.filter(namespaceFilter);
                        var pods = scope.model.pods.filter(namespaceFilter);
                        var hosts = scope.model.hosts;
                        var parentEl = element.find('[hawtio-jsplumb]');
                        var children = parentEl.find('.jsplumb-node');
                        children.each(function (index, c) {
                            var child = angular.element(c);
                            var key = child.attr('id');
                            if (Core.isBlank(key)) {
                                return;
                            }
                            var type = child.attr('data-type');
                            switch (type) {
                                case 'host':
                                    Kubernetes.log.debug('key: ', key);
                                    if (key in scope.model.podsByHost) {
                                        return;
                                    }
                                    break;
                                case 'service':
                                    if (key in scope.model.servicesByKey && scope.model.servicesByKey[key].namespace == scope.kubernetes.selectedNamespace) {
                                        var service = scope.model.servicesByKey[key];
                                        child.attr('connect-to', service.connectTo);
                                        return;
                                    }
                                    break;
                                case 'pod':
                                    /*
                                    if (hasId(pods, id)) {
                                      return;
                                    }
                                    */
                                    if (key in scope.model.podsByKey && scope.model.podsByKey[key].namespace == scope.kubernetes.selectedNamespace) {
                                        return;
                                    }
                                    break;
                                case 'replicationController':
                                    if (key in scope.model.replicationControllersByKey && scope.model.replicationControllersByKey[key].namespace == scope.kubernetes.selectedNamespace) {
                                        var replicationController = scope.model.replicationControllersByKey[key];
                                        child.attr('connect-to', replicationController.connectTo);
                                        return;
                                    }
                                    break;
                                default:
                                    Kubernetes.log.debug("Ignoring element with unknown type");
                                    return;
                            }
                            Kubernetes.log.debug("Removing: ", key);
                            child.remove();
                        });
                        var servicesEl = parentEl.find(".services");
                        var hostsEl = parentEl.find(".hosts");
                        var replicationControllersEl = parentEl.find(".replicationControllers");
                        appendNewElements(servicesEl, $templateCache.get("serviceTemplate.html"), "service", services.filter(namespaceFilter));
                        appendNewElements(replicationControllersEl, $templateCache.get("replicationControllerTemplate.html"), "replicationController", replicationControllers.filter(namespaceFilter));
                        appendNewElements(hostsEl, $templateCache.get("hostTemplate.html"), "host", hosts);
                        hosts.forEach(function (host) {
                            var hostEl = parentEl.find("#" + host._key);
                            appendNewElements(hostEl, $templateCache.get("podTemplate.html"), "pod", host.pods.filter(namespaceFilter));
                        });
                    });
                }
                function refreshDrawing() {
                    if (element.children().length === 0) {
                        firstDraw();
                    }
                    else {
                        update();
                    }
                    Core.$apply(scope);
                }
                scope.$on('kubernetesModelUpdated', refreshDrawing);
                // detect the view changing after the last time the model changed
                scope.$on("$routeChangeSuccess", function () {
                    setTimeout(refreshDrawing, 100);
                });
            }
        };
    }]);
    var OverviewBoxController = Kubernetes.controller("OverviewBoxController", ["$scope", "$location", function ($scope, $location) {
        $scope.viewDetails = function (entity, path) {
            if (entity) {
                var namespace = entity.namespace;
                var id = entity.id;
                $location.path(UrlHelpers.join('/kubernetes/namespace', namespace, path, id));
            }
            else {
                Kubernetes.log.warn("No entity for viewDetails!");
            }
        };
    }]);
    var scopeName = "OverviewController";
    var OverviewController = Kubernetes.controller(scopeName, ["$scope", "$location", "$http", "$timeout", "$routeParams", "KubernetesModel", "KubernetesState", "KubernetesApiURL", function ($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL) {
        $scope.name = scopeName;
        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;
        ControllerHelpers.bindModelToSearchParam($scope, $location, 'kubernetes.selectedNamespace', 'namespace', undefined);
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.PodController = Kubernetes.controller("PodController", ["$scope", "KubernetesModel", "KubernetesState", "$templateCache", "$location", "$routeParams", "$http", "$timeout", "KubernetesApiURL", function ($scope, KubernetesModel, KubernetesState, $templateCache, $location, $routeParams, $http, $timeout, KubernetesApiURL) {
        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;
        $scope.itemConfig = {
            properties: {
                'manifest/containers/image$': {
                    template: $templateCache.get('imageTemplate.html')
                },
                'currentState/status': {
                    template: $templateCache.get('statusTemplate.html')
                },
                '\\/Env\\/': {
                    template: $templateCache.get('envItemTemplate.html')
                },
                '^\\/labels$': {
                    template: $templateCache.get('labelTemplate.html')
                },
                '\\/env\\/key$': {
                    hidden: true
                }
            }
        };
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        $scope.$on('kubernetesModelUpdated', function () {
            updateData();
        });
        $scope.$on('$routeUpdate', function ($event) {
            updateData();
        });
        updateData();
        function updateData() {
            $scope.id = $routeParams["id"];
            $scope.item = $scope.model.getPod(KubernetesState.selectedNamespace, $scope.id);
            Core.$apply($scope);
        }
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.EnvItem = Kubernetes.controller("EnvItem", ["$scope", function ($scope) {
        var parts = $scope.data.split('=');
        $scope.key = parts.shift();
        $scope.value = parts.join('=');
    }]);
    // main controller for the page
    Kubernetes.Pods = Kubernetes.controller("Pods", ["$scope", "KubernetesModel", "KubernetesPods", "KubernetesState", "ServiceRegistry", "$dialog", "$window", "$templateCache", "$routeParams", "$location", "localStorage", "$http", "$timeout", "KubernetesApiURL", function ($scope, KubernetesModel, KubernetesPods, KubernetesState, ServiceRegistry, $dialog, $window, $templateCache, $routeParams, $location, localStorage, $http, $timeout, KubernetesApiURL) {
        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;
        $scope.$on('kubernetesModelUpdated', function () {
            Core.$apply($scope);
        });
        $scope.itemSchema = Forms.createFormConfiguration();
        $scope.hasService = function (name) { return Service.hasService(ServiceRegistry, name); };
        $scope.tableConfig = {
            data: 'model.pods',
            showSelectionCheckbox: true,
            enableRowClickSelection: false,
            multiSelect: true,
            selectedItems: [],
            filterOptions: {
                filterText: $location.search()["q"] || ''
            },
            columnDefs: [
                {
                    field: 'id',
                    displayName: 'ID',
                    defaultSort: true,
                    cellTemplate: $templateCache.get("idTemplate.html")
                },
                {
                    field: 'currentState.status',
                    displayName: 'Status',
                    cellTemplate: $templateCache.get("statusTemplate.html")
                },
                {
                    field: 'containerImages',
                    displayName: 'Images',
                    cellTemplate: $templateCache.get("imageTemplate.html")
                },
                {
                    field: 'currentState.host',
                    displayName: 'Host',
                    cellTemplate: $templateCache.get("hostTemplate.html")
                },
                {
                    field: 'labels',
                    displayName: 'Labels',
                    cellTemplate: $templateCache.get("labelTemplate.html")
                },
                {
                    field: 'currentState.podIP',
                    displayName: 'Pod IP'
                }
            ]
        };
        $scope.openLogs = function () {
            var pods = $scope.tableConfig.selectedItems;
            if (!pods || !pods.length) {
                if ($scope.id) {
                    var item = $scope.item;
                    if (item) {
                        pods = [item];
                    }
                }
            }
            Kubernetes.openLogsForPods(ServiceRegistry, $window, pods);
        };
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        ;
        KubernetesPods.then(function (KubernetesPods) {
            $scope.deletePrompt = function (selected) {
                if (angular.isString(selected)) {
                    selected = [{
                        id: selected
                    }];
                }
                UI.multiItemConfirmActionDialog({
                    collection: selected,
                    index: 'id',
                    onClose: function (result) {
                        if (result) {
                            function deleteSelected(selected, next) {
                                if (next) {
                                    Kubernetes.log.debug("deleting: ", next.id);
                                    KubernetesPods.delete({
                                        id: next.id
                                    }, undefined, function () {
                                        Kubernetes.log.debug("deleted: ", next.id);
                                        deleteSelected(selected, selected.shift());
                                    }, function (error) {
                                        Kubernetes.log.debug("Error deleting: ", error);
                                        deleteSelected(selected, selected.shift());
                                    });
                                }
                            }
                            deleteSelected(selected, selected.shift());
                        }
                    },
                    title: 'Delete pods?',
                    action: 'The following pods will be deleted:',
                    okText: 'Delete',
                    okClass: 'btn-danger',
                    custom: "This operation is permanent once completed!",
                    customClass: "alert alert-warning"
                }).open();
            };
        });
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.ReplicationControllerController = Kubernetes.controller("ReplicationControllerController", ["$scope", "KubernetesModel", "KubernetesState", "$templateCache", "$location", "$routeParams", "$http", "$timeout", "KubernetesApiURL", function ($scope, KubernetesModel, KubernetesState, $templateCache, $location, $routeParams, $http, $timeout, KubernetesApiURL) {
        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        $scope.itemConfig = {
            properties: {
                '^\\/labels$': {
                    template: $templateCache.get('labelTemplate.html')
                }
            }
        };
        $scope.$on('kubernetesModelUpdated', function () {
            updateData();
        });
        $scope.$on('$routeUpdate', function ($event) {
            updateData();
        });
        updateData();
        function updateData() {
            $scope.id = $routeParams["id"];
            $scope.item = $scope.model.getReplicationController(KubernetesState.selectedNamespace, $scope.id);
            Core.$apply($scope);
        }
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.ReplicationControllers = Kubernetes.controller("ReplicationControllers", ["$scope", "KubernetesModel", "KubernetesReplicationControllers", "KubernetesPods", "KubernetesState", "$templateCache", "$location", "$routeParams", "jolokia", "$http", "$timeout", "KubernetesApiURL", function ($scope, KubernetesModel, KubernetesReplicationControllers, KubernetesPods, KubernetesState, $templateCache, $location, $routeParams, jolokia, $http, $timeout, KubernetesApiURL) {
        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;
        $scope.$on('kubernetesModelUpdated', function () {
            Core.$apply($scope);
        });
        $scope.tableConfig = {
            data: 'model.replicationControllers',
            showSelectionCheckbox: true,
            enableRowClickSelection: false,
            multiSelect: true,
            selectedItems: [],
            filterOptions: {
                filterText: $location.search()["q"] || ''
            },
            columnDefs: [
                { field: 'id', displayName: 'ID', cellTemplate: $templateCache.get("idTemplate.html") },
                { field: '$podsLink', displayName: 'Pods', cellTemplate: $templateCache.get("podCountsAndLinkTemplate.html") },
                { field: 'desiredState.replicas', displayName: 'Replicas', cellTemplate: $templateCache.get("desiredReplicas.html") },
                { field: 'labelsText', displayName: 'Labels', cellTemplate: $templateCache.get("labelTemplate.html") },
                { field: 'namespace', displayName: 'Namespace' }
            ]
        };
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        KubernetesReplicationControllers.then(function (KubernetesReplicationControllers) {
            KubernetesPods.then(function (KubernetesPods) {
                $scope.deletePrompt = function (selected) {
                    if (angular.isString(selected)) {
                        selected = [{
                            id: selected
                        }];
                    }
                    UI.multiItemConfirmActionDialog({
                        collection: selected,
                        index: 'id',
                        onClose: function (result) {
                            if (result) {
                                function deleteSelected(selected, next) {
                                    if (next) {
                                        Kubernetes.log.debug("deleting: ", next.id);
                                        KubernetesReplicationControllers.delete({
                                            id: next.id
                                        }, undefined, function () {
                                            Kubernetes.log.debug("deleted: ", next.id);
                                            deleteSelected(selected, selected.shift());
                                        }, function (error) {
                                            Kubernetes.log.debug("Error deleting: ", error);
                                            deleteSelected(selected, selected.shift());
                                        });
                                    }
                                }
                                deleteSelected(selected, selected.shift());
                            }
                        },
                        title: 'Delete replication controllers?',
                        action: 'The following replication controllers will be deleted:',
                        okText: 'Delete',
                        okClass: 'btn-danger',
                        custom: "This operation is permanent once completed!",
                        customClass: "alert alert-warning"
                    }).open();
                };
            });
        });
        function maybeInit() {
        }
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.ServiceController = Kubernetes.controller("ServiceController", ["$scope", "KubernetesModel", "KubernetesState", "$templateCache", "$location", "$routeParams", "$http", "$timeout", "KubernetesApiURL", function ($scope, KubernetesModel, KubernetesState, $templateCache, $location, $routeParams, $http, $timeout, KubernetesApiURL) {
        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        $scope.itemConfig = {
            properties: {
                '^\\/labels$': {
                    template: $templateCache.get('labelTemplate.html')
                }
            }
        };
        $scope.$on('kubernetesModelUpdated', function () {
            updateData();
        });
        $scope.$on('$routeUpdate', function ($event) {
            updateData();
        });
        updateData();
        function updateData() {
            $scope.id = $routeParams["id"];
            $scope.item = $scope.model.getService(KubernetesState.selectedNamespace, $scope.id);
            Core.$apply($scope);
        }
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    Kubernetes.Services = Kubernetes.controller("Services", ["$scope", "KubernetesModel", "KubernetesServices", "KubernetesPods", "KubernetesState", "$templateCache", "$location", "$routeParams", "jolokia", "$http", "$timeout", "KubernetesApiURL", function ($scope, KubernetesModel, KubernetesServices, KubernetesPods, KubernetesState, $templateCache, $location, $routeParams, jolokia, $http, $timeout, KubernetesApiURL) {
        $scope.kubernetes = KubernetesState;
        $scope.model = KubernetesModel;
        $scope.tableConfig = {
            data: 'model.services',
            showSelectionCheckbox: true,
            enableRowClickSelection: false,
            multiSelect: true,
            selectedItems: [],
            filterOptions: {
                filterText: $location.search()["q"] || ''
            },
            columnDefs: [
                { field: 'id', displayName: 'ID', cellTemplate: $templateCache.get("idTemplate.html") },
                { field: '$podsLink', displayName: 'Pods', cellTemplate: $templateCache.get("podCountsAndLinkTemplate.html") },
                { field: 'selector', displayName: 'Selector', cellTemplate: $templateCache.get("selectorTemplate.html") },
                { field: 'portalIP', displayName: 'Address', cellTemplate: $templateCache.get("portalAddress.html") },
                { field: 'labelsText', displayName: 'Labels', cellTemplate: $templateCache.get("labelTemplate.html") },
                { field: 'namespace', displayName: 'Namespace' }
            ]
        };
        Kubernetes.initShared($scope, $location, $http, $timeout, $routeParams, KubernetesModel, KubernetesState, KubernetesApiURL);
        $scope.$on('kubernetesModelUpdated', function () {
            Core.$apply($scope);
        });
        KubernetesServices.then(function (KubernetesServices) {
            KubernetesPods.then(function (KubernetesPods) {
                $scope.deletePrompt = function (selected) {
                    if (angular.isString(selected)) {
                        selected = [{
                            id: selected
                        }];
                    }
                    UI.multiItemConfirmActionDialog({
                        collection: selected,
                        index: 'id',
                        onClose: function (result) {
                            if (result) {
                                function deleteSelected(selected, next) {
                                    if (next) {
                                        Kubernetes.log.debug("deleting: ", next.id);
                                        KubernetesServices.delete({
                                            id: next.id
                                        }, undefined, function () {
                                            Kubernetes.log.debug("deleted: ", next.id);
                                            deleteSelected(selected, selected.shift());
                                        }, function (error) {
                                            Kubernetes.log.debug("Error deleting: ", error);
                                            deleteSelected(selected, selected.shift());
                                        });
                                    }
                                }
                                deleteSelected(selected, selected.shift());
                            }
                        },
                        title: 'Delete services?',
                        action: 'The following services will be deleted:',
                        okText: 'Delete',
                        okClass: 'btn-danger',
                        custom: "This operation is permanent once completed!",
                        customClass: "alert alert-warning"
                    }).open();
                };
            });
        });
    }]);
})(Kubernetes || (Kubernetes = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
var Kubernetes;
(function (Kubernetes) {
    // controller for the status icon cell
    Kubernetes.PodStatus = Kubernetes.controller("PodStatus", ["$scope", function ($scope) {
        $scope.statusMapping = function (text) {
            return Kubernetes.statusTextToCssClass(text);
        };
    }]);
    // controller that deals with the labels per pod
    Kubernetes.Labels = Kubernetes.controller("Labels", ["$scope", "workspace", "jolokia", "$location", function ($scope, workspace, jolokia, $location) {
        $scope.labels = [];
        var labelKeyWeights = {
            "name": 1,
            "replicationController": 2,
            "group": 3
        };
        $scope.$watch('entity', function (newValue, oldValue) {
            if (newValue) {
                // log.debug("labels: ", newValue);
                // massage the labels a bit
                $scope.labels = [];
                angular.forEach($scope.entity.labels, function (value, key) {
                    if (key === 'fabric8') {
                        // TODO not sure what this is for, the container type?
                        return;
                    }
                    $scope.labels.push({
                        key: key,
                        title: value
                    });
                });
                //  lets sort by key but lets make sure that we weight certain labels so they are first
                $scope.labels = $scope.labels.sort(function (a, b) {
                    function getWeight(key) {
                        return labelKeyWeights[key] || 1000;
                    }
                    var n1 = a["key"];
                    var n2 = b["key"];
                    var w1 = getWeight(n1);
                    var w2 = getWeight(n2);
                    var diff = w1 - w2;
                    if (diff < 0) {
                        return -1;
                    }
                    else if (diff > 0) {
                        return 1;
                    }
                    if (n1 && n2) {
                        if (n1 > n2) {
                            return 1;
                        }
                        else if (n1 < n2) {
                            return -1;
                        }
                        else {
                            return 0;
                        }
                    }
                    else {
                        if (n1 === n2) {
                            return 0;
                        }
                        else if (n1) {
                            return 1;
                        }
                        else {
                            return -1;
                        }
                    }
                });
            }
        });
        $scope.handleClick = function (entity, labelType, value) {
            // log.debug("handleClick, entity: ", entity, " key: ", labelType, " value: ", value);
            var filterTextSection = labelType + "=" + value.title;
            $scope.$emit('labelFilterUpdate', filterTextSection);
        };
        var labelColors = {
            'version': 'background-blue',
            'name': 'background-light-green',
            'container': 'background-light-grey'
        };
        $scope.labelClass = function (labelType) {
            if (!(labelType in labelColors)) {
                return 'mouse-pointer';
            }
            else
                return labelColors[labelType] + ' mouse-pointer';
        };
    }]);
})(Kubernetes || (Kubernetes = {}));

angular.module("hawtio-kubernetes-templates", []).run(["$templateCache", function($templateCache) {$templateCache.put("plugins/kubernetes/html/apps.html","<div ng-controller=\"Kubernetes.Apps\">\n  <script type=\"text/ng-template\" id=\"appIconTemplate.html\">\n    <div class=\"ngCellText\" title=\"{{row.entity.$info.description}}\">\n      <a ng-href=\"row.entity.$appUrl\">\n        <img ng-show=\"row.entity.$iconUrl\" class=\"app-icon-small\" ng-src=\"{{row.entity.$iconUrl}}\">\n      </a>\n      <span class=\"app-name\">\n        <a ng-click=\"row.entity.$select()\">\n          {{row.entity.$info.name}}\n        </a>\n      </span>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"appServicesTemplate.html\">\n    <div class=\"ngCellText\">\n      <span ng-repeat=\"service in row.entity.services\">\n          <a ng-href=\"{{service | kubernetesPageLink}}\">\n          <span>{{service.name || service.id}}</span>\n        </a>\n      </span>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"appDeployedTemplate.html\">\n    <div class=\"ngCellText\" title=\"deployed at: {{row.entity.$creationDate | date:\'yyyy-MMM-dd HH:mm:ss Z\'}}\">\n      {{row.entity.$creationDate.relative()}}\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"appReplicationControllerTemplate.html\">\n    <div class=\"ngCellText\">\n      <span ng-repeat=\"controller in row.entity.replicationControllers\">\n        <a ng-href=\"{{controller | kubernetesPageLink}}\">\n          <span>{{controller.id}}</span>\n        </a>\n        &nbsp;\n        <span class=\"btn btn-sm\" ng-click=\"resizeDialog.open(controller)\" title=\"Resize the number of replicas of this controller\">{{controller.replicas}}</span>\n      </span>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"appPodCountsAndLinkTemplate.html\">\n    <div class=\"ngCellText\" title=\"Number of running pods for this controller\">\n      <div ng-repeat=\"podCounters in row.entity.$podCounters track by $index\">\n        <a ng-show=\"podCounters.podsLink\" href=\"{{podCounters.podsLink}}\" title=\"{{podCounters.labelText}}\">\n          <span ng-show=\"podCounters.valid\" class=\"badge badge-success\">{{podCounters.valid}}</span>\n          <span ng-show=\"podCounters.waiting\" class=\"badge\">{{podCounters.waiting}}</span>\n          <span ng-show=\"podCounters.error\" class=\"badge badge-warning\">{{podCounters.error}}</span>\n        </a>\n      </div>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"appDetailTemplate.html\">\n    <div class=\"service-view-rectangle\" ng-repeat=\"view in item.$serviceViews\">\n      <div class=\"service-view-header\">\n        <span class=\"service-view-icon\">\n          <img ng-show=\"item.$iconUrl\" ng-src=\"{{item.$iconUrl}}\">\n        </span>\n        <span class=\"service-view-name\" title=\"{{view.name}}\">{{view.appName}}</span>\n        <span class=\"service-view-address\" title=\"Go to the service detail page\"><a ng-href=\"{{view.service | kubernetesPageLink}}\">{{view.address}}</a></span>\n      </div>\n\n      <div class=\"service-view-detail-rectangle\">\n        <div class=\"service-view-detail-header\">\n          <div class=\"col-md-4\">\n            <div class=\"service-view-detail-deployed\" ng-show=\"view.createdDate\"\n                 title=\"deployed at: {{view.createdDate | date:\'yyyy-MMM-dd HH:mm:ss Z\'}}\">\n              deployed:\n              <span class=\"value\">{{view.createdDate.relative()}}</span>\n            </div>\n          </div>\n          <div class=\"col-md-4\">\n            <div class=\"service-view-detail-pod-template\" ng-show=\"view.controllerId\">\n              pod template:\n              <span class=\"value\" title=\"Go to the replication controller detail page\"><a ng-href=\"{{view.replicationController | kubernetesPageLink}}\">{{view.controllerId}}</a></span>\n            </div>\n          </div>\n          <div class=\"col-md-4 service-view-detail-pod-counts\">\n            <a ng-show=\"view.replicationController\" class=\"value pull-right\"\n               ng-click=\"resizeDialog.open(view.replicationController)\"\n               title=\"Resize the number of pods\">\n              {{view.podCountText}}\n            </a>\n            <span ng-hide=\"view.replicationController\" class=\"value pull-right\">\n              {{view.podCountText}}\n            </span>\n          </div>\n        </div>\n\n        <div class=\"service-view-detail-pod-box\" ng-repeat=\"pod in item.pods track by $index\">\n          <div ng-show=\"podExpanded(pod)\" class=\"service-view-detail-pod-summary-expand\">\n            <table>\n              <tr>\n                <td class=\"service-view-detail-pod-status\">\n                  <i ng-class=\"pod.statusClass\"></i>\n                </td>\n                <td class=\"service-view-detail-pod-connect\" ng-show=\"pod.$jolokiaUrl\" ng-controller=\"Kubernetes.ConnectController\">\n                  <a class=\"clickable\"\n                     ng-click=\"doConnect(pod)\"\n                     title=\"Open a new window and connect to this container\">\n                    <i class=\"fa fa-sign-in\"></i>\n                  </a>\n                </td>\n                <td>\n                  <div class=\"service-view-detail-pod-id\" title=\"{{pod.id}}\">\n                    <span class=\"value\">Pod <a title=\"Go to the pod detail page\" ng-href=\"{{pod | kubernetesPageLink}}\">{{pod.idAbbrev}}</a></span>\n                  </div>\n                  <div class=\"service-view-detail-pod-ip\">\n                    IP:\n                    <span class=\"value\">{{pod.currentState.podIP}}</span>\n                  </div>\n                </td>\n                <td>\n                  <div class=\"service-view-detail-pod-ports\">\n                    ports: <span class=\"value\">{{pod.$containerPorts.join(\", \")}}</span>\n                  </div>\n                  <div class=\"service-view-detail-pod-minion\">\n                    minion:\n                    <span class=\"value\">\n                      <a ng-show=\"pod.currentState.host\" ng-href=\"/kubernetes/hosts/{{pod.currentState.host}}\">{{pod.currentState.host}}</a>\n                    </span>\n                  </div>\n                </td>\n                <td class=\"service-view-detail-pod-expand\" ng-click=\"collapsePod(pod)\">\n                  <i class=\"fa fa-chevron-left\"></i>\n                </td>\n              </tr>\n            </table>\n            <!--\n                                      <div class=\"service-view-detail-pod-status\">\n                                        status:\n                                        <span class=\"value\">{{pod.status}}</span>\n                                      </div>\n            -->\n          </div>\n\n          <div ng-hide=\"podExpanded(pod)\" class=\"service-view-detail-pod-summary\">\n            <table>\n              <tr>\n                <td class=\"service-view-detail-pod-status\">\n                  <i ng-class=\"pod.statusClass\"></i>\n                </td>\n                <td class=\"service-view-detail-pod-connect\" ng-show=\"pod.$jolokiaUrl\" ng-controller=\"Kubernetes.ConnectController\">\n                  <a class=\"clickable\"\n                     ng-click=\"doConnect(pod)\"\n                     title=\"Open a new window and connect to this container\">\n                    <i class=\"fa fa-sign-in\"></i>\n                  </a>\n                </td>\n                <td>\n                  <div class=\"service-view-detail-pod-id\" title=\"{{pod.id}}\">\n                    <span class=\"value\">Pod <a title=\"Go to the pod detail page\" ng-href=\"{{pod | kubernetesPageLink}}\">{{pod.idAbbrev}}</a></span>\n                  </div>\n                  <div class=\"service-view-detail-pod-ip\">\n                    IP:\n                    <span class=\"value\">{{pod.currentState.podIP}}</span>\n                  </div>\n                </td>\n                <td class=\"service-view-detail-pod-expand\" ng-click=\"expandPod(pod)\">\n                  <i class=\"fa fa-chevron-right\"></i>\n                </td>\n              </tr>\n            </table>\n          </div>\n        </div>\n      </div>\n    </div>\n  </script>\n\n\n  <div ng-hide=\"appSelectorShow\">\n    <div class=\"row filter-header\">\n      <div class=\"col-md-12\">\n        <span ng-include=\"\'namespaceSelector.html\'\"></span>\n        <span ng-show=\"model.apps.length && !id\">\n          <hawtio-filter ng-model=\"tableConfig.filterOptions.filterText\"\n                         css-class=\"input-xxlarge\"\n                         placeholder=\"Filter apps...\"></hawtio-filter>\n        </span>\n        <button ng-show=\"model.apps.length\"\n                class=\"btn btn-danger pull-right\"\n                ng-disabled=\"!id && tableConfig.selectedItems.length == 0\"\n                ng-click=\"deletePrompt(id || tableConfig.selectedItems)\">\n          <i class=\"fa fa-remove\"></i> Delete\n        </button>\n        <span class=\"pull-right\">&nbsp;</span>\n        <button ng-show=\"model.appFolders.length\"\n                class=\"btn btn-success pull-right\"\n                ng-click=\"appSelectorShow = true\"\n                title=\"Run an application\">\n          <i class=\"fa fa-play-circle\"></i> Run ...\n        </button>\n        <span class=\"pull-right\">&nbsp;</span>\n        <button ng-show=\"id\"\n                class=\"btn btn-primary pull-right\"\n                ng-click=\"id = undefined\"><i class=\"fa fa-list\"></i></button>\n\n        <span class=\"pull-right\">&nbsp;</span>\n        <span ng-hide=\"id\" class=\"pull-right\">\n          <div class=\"btn-group\">\n            <a class=\"btn btn-sm\" ng-disabled=\"mode == \'list\'\" href=\"\" ng-click=\"mode = \'list\'\">\n              <i class=\"fa fa-list\"></i></a>\n            <a class=\"btn btn-sm\" ng-disabled=\"mode == \'detail\'\" href=\"\" ng-click=\"mode = \'detail\'\">\n              <i class=\"fa fa-table\"></i></a>\n          </div>\n        </span>\n      </div>\n    </div>\n    <div class=\"row\">\n      <div class=\"col-md-12\">\n        <div ng-hide=\"model.fetched\">\n          <div class=\"align-center\">\n            <i class=\"fa fa-spinner fa-spin\"></i>\n          </div>\n        </div>\n        <div ng-show=\"model.fetched && !id\">\n          <div ng-hide=\"model.apps.length\" class=\"align-center\">\n            <p class=\"alert alert-info\">There are no apps currently available.</p>\n          </div>\n          <div ng-show=\"model.apps.length\">\n            <div ng-show=\"mode == \'list\'\">\n              <table class=\"table table-condensed table-striped\" hawtio-simple-table=\"tableConfig\"></table>\n            </div>\n            <div ng-show=\"mode == \'detail\'\">\n              <div class=\"app-detail\" ng-repeat=\"item in model.apps | filter:tableConfig.filterOptions.filterText\">\n                <ng-include src=\"\'appDetailTemplate.html\'\"/>\n              </div>\n            </div>\n          </div>\n        </div>\n        <div ng-show=\"model.fetched && id\">\n          <div class=\"app-detail\">\n            <ng-include src=\"\'appDetailTemplate.html\'\"/>\n          </div>\n        </div>\n      </div>\n    </div>\n\n  </div>\n  <div ng-show=\"appSelectorShow\">\n    <div class=\"col-md-7\">\n      <div class=\"row\">\n        <hawtio-filter ng-model=\"appSelector.filterText\"\n                       css-class=\"input-xxlarge\"\n                       placeholder=\"Filter apps...\"></hawtio-filter>\n      </div>\n      <div class=\"row\">\n        <ul>\n          <li class=\"no-list profile-selector-folder\" ng-repeat=\"folder in model.appFolders\"\n              ng-show=\"appSelector.showFolder(folder)\">\n            <div class=\"expandable\" ng-class=\"appSelector.isOpen(folder)\">\n              <div title=\"{{folder.path}}\" class=\"title\">\n                <i class=\"expandable-indicator folder\"></i> <span class=\"folder-title\" ng-show=\"folder.path\">{{folder.path.capitalize(true)}}</span><span\n                      class=\"folder-title\" ng-hide=\"folder.path\">Uncategorized</span>\n              </div>\n              <div class=\"expandable-body\">\n                <ul>\n                  <li class=\"no-list profile\" ng-repeat=\"profile in folder.apps\" ng-show=\"appSelector.showApp(profile)\">\n                    <div class=\"profile-selector-item\">\n                      <div class=\"inline-block profile-selector-checkbox\">\n                        <input type=\"checkbox\" ng-model=\"profile.selected\"\n                               ng-change=\"appSelector.updateSelected()\">\n                      </div>\n                      <div class=\"inline-block profile-selector-name\" ng-class=\"appSelector.getSelectedClass(profile)\">\n                        <span class=\"contained c-max\">\n                          <a href=\"\" ng-click=\"appSelector.select(profile, !profile.selected)\"\n                             title=\"Details for {{profile.id}}\">\n                              <img ng-show=\"profile.$iconUrl\" class=\"icon-small-app\" ng-src=\"{{profile.$iconUrl}}\">\n                              <span class=\"app-name\">{{profile.name}}</span>\n                          </a>\n                        </span>\n                      </div>\n                    </div>\n\n                  </li>\n                </ul>\n              </div>\n            </div>\n          </li>\n        </ul>\n      </div>\n    </div>\n    <div class=\"col-md-5\">\n      <div class=\"row\">\n        <button class=\"btn btn-primary pull-right\"\n                ng-click=\"appSelectorShow = undefined\"><i class=\"fa fa-circle-arrow-left\"></i> Back\n        </button>\n        <span class=\"pull-right\">&nbsp;</span>\n        <button class=\"btn pull-right\"\n                ng-disabled=\"!appSelector.selectedApps.length\"\n                title=\"Clears the selected Apps\"\n                ng-click=\"appSelector.clearSelected()\"><i class=\"fa fa-check-empty\"></i> Clear\n        </button>\n        <span class=\"pull-right\">&nbsp;</span>\n        <button class=\"btn btn-success pull-right\"\n                ng-disabled=\"!appSelector.selectedApps.length\"\n                ng-click=\"appSelector.runSelectedApps()\"\n                title=\"Run the selected apps\">\n          <i class=\"fa fa-play-circle\"></i>\n          <ng-pluralize count=\"appSelector.selectedApps.length\"\n                        when=\"{\'0\': \'No App Selected\',\n                                       \'1\': \'Run App\',\n                                       \'other\': \'Run {} Apps\'}\"></ng-pluralize>\n\n        </button>\n      </div>\n      <div class=\"row\">\n<!--\n        <div ng-hide=\"appSelector.selectedApps.length\">\n          <p class=\"alert pull-right\">\n            Please select an App\n          </p>\n        </div>\n-->\n\n        <div ng-show=\"appSelector.selectedApps.length\">\n\n          <ul class=\"zebra-list pull-right\">\n            <li ng-repeat=\"app in appSelector.selectedApps\">\n              <img ng-show=\"app.$iconUrl\" class=\"icon-selected-app\" ng-src=\"{{app.$iconUrl}}\">\n              <strong class=\"green selected-app-name\">{{app.name}}</strong>\n              &nbsp;\n              <i class=\"red clickable fa fa-remove\"\n                 title=\"Remove appp\"\n                 ng-click=\"appSelector.select(app, false)\"></i>\n            </li>\n          </ul>\n        </div>\n      </div>\n    </div>\n  </div>\n  <ng-include src=\"\'resizeDialog.html\'\"/>\n</div>\n");
$templateCache.put("plugins/kubernetes/html/host.html","<div ng-controller=\"Kubernetes.HostController\">\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <span class=\"pull-right\">&nbsp;</span>\n      <a class=\"btn btn-default pull-right\"\n              href=\"/kubernetes/hosts\"><i class=\"fa fa-list\"></i></a>\n      <a class=\"btn btn-primary pull-right\"\n              title=\"View all the pods on this host\"\n              href=\"/kubernetes/pods/?q=host={{item.id}}\">\n        Pods\n      </a>\n    </div>\n  </div>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <div ng-hide=\"model.fetched\">\n        <div class=\"align-center\">\n          <i class=\"fa fa-spinner fa-spin\"></i>\n        </div>\n      </div>\n      <div ng-show=\"model.fetched\">\n        <div hawtio-object=\"item\" config=\"itemConfig\"></div>\n      </div>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/kubernetes/html/hosts.html","<div class=\"row\" ng-controller=\"Kubernetes.HostsController\">\n  <script type=\"text/ng-template\" id=\"hostLinkTemplate.html\">\n    <div class=\"ngCellText\">\n      </div>\n  </script>\n  <div class=\"row\">\n    <div class=\"col-md-12\" ng-show=\"model.hosts.length\">\n      <span ng-show=\"!id\">\n        <hawtio-filter ng-model=\"tableConfig.filterOptions.filterText\"\n                       css-class=\"input-xxlarge\"\n                       placeholder=\"Filter hosts...\"></hawtio-filter>\n      </span>\n    </div>\n  </div>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <div ng-hide=\"model.fetched\">\n        <div class=\"align\">\n          <i class=\"fa fa-spinner fa-spin\"></i>\n        </div>\n      </div>\n      <div ng-show=\"model.fetched\">\n        <div ng-hide=\"model.hosts.length\" class=\"align-center\">\n          <p class=\"alert alert-info\">There are no hosts currently running.</p>\n        </div>\n        <div ng-show=\"model.hosts.length\">\n          <table class=\"table table-condensed table-striped\" ui-if=\"kubernetes.selectedNamespace\"\n                 hawtio-simple-table=\"tableConfig\"></table>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/kubernetes/html/kubernetesJsonDirective.html","<div>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <div class=\"fabric-page-header row\">\n\n        <div class=\"pull-left\" ng-show=\"iconURL\">\n          <div class=\"app-logo\">\n            <img ng-src=\"{{iconURL}}\">&nbsp;\n          </div>\n        </div>\n        <div class=\"pull-left\">\n            <h2 class=\"list-inline\"><span class=\"contained c-wide3\">&nbsp;{{displayName || appTitle}}</span></h2>\n        </div>\n        <div class=\"pull-right\">\n          <button class=\"btn btn-success pull-right\"\n                  title=\"Run this application\"\n                  ng-disabled=\"!config || config.error\"\n                  ng-click=\"apply()\">\n            <i class=\"fa fa-play-circle\"></i> Run\n          </button>\n        </div>\n        <div class=\"pull-left col-md-10 profile-summary-wide\">\n          <div\n               ng-show=\"summaryHtml\"\n               ng-bind-html-unsafe=\"summaryHtml\"></div>\n        </div>\n      </div>\n\n    </div>\n  </div>\n\n</div>\n");
$templateCache.put("plugins/kubernetes/html/layoutKubernetes.html","<script type=\"text/ng-template\" id=\"idTemplate.html\">\n  <div class=\"ngCellText\">\n    <a href=\"\" \n       title=\"View details for {{row.entity.id}}\"\n       ng-href=\"{{row.entity | kubernetesPageLink}}\">\n      <img class=\"app-icon-small\" ng-src=\"{{row.entity.$iconUrl}}\">\n      {{row.entity.id}}</a>\n  </div>\n</script>\n<script type=\"text/ng-template\" id=\"selectorTemplate.html\">\n  <div class=\"ngCellText\">\n    <span ng-repeat=\"(name, value) in row.entity.selector track by $index\">\n      <strong>{{name}}</strong>: {{value}}\n    </span>\n  </div>\n</script>\n<script type=\"text/ng-template\" id=\"podCountsAndLinkTemplate.html\">\n  <div class=\"ngCellText\" title=\"Number of running pods for this controller\">\n    <a ng-show=\"row.entity.$podCounters.podsLink\" href=\"{{row.entity.$podCounters.podsLink}}\" title=\"View pods\">\n      <span ng-show=\"row.entity.$podCounters.valid\" class=\"badge badge-success\">{{row.entity.$podCounters.valid}}</span>\n      <span ng-show=\"row.entity.$podCounters.waiting\" class=\"badge\">{{row.entity.$podCounters.waiting}}</span>\n      <span ng-show=\"row.entity.$podCounters.error\" class=\"badge badge-warning\">{{row.entity.$podCounters.error}}</span>\n    </a>\n  </div>\n</script>\n<script type=\"text/ng-template\" id=\"labelTemplate.html\">\n  <div class=\"ngCellText\" ng-init=\"entity=row.entity\" ng-controller=\"Kubernetes.Labels\">\n    <p ng-show=\"data\"><strong>Labels</strong></p>\n    <span ng-repeat=\"label in labels track by $index\"\n          class=\"pod-label badge\"\n          ng-class=\"labelClass(label.key)\"\n          ng-click=\"handleClick(entity, label.key, label)\"\n          title=\"{{label.key}}\">{{label.title}}</span>\n  </div>\n</script>\n<script type=\"text/ng-template\" id=\"hostTemplate.html\">\n  <div class=\"ngCellText\" ng-init=\"host=row.entity.currentState.host\">\n    <span class=\"pod-label badge\"\n          class=\"background-light-grey mouse-pointer\"\n          ng-click=\"$emit(\'labelFilterUpdate\', \'host=\' + host)\">{{host}}</span>\n  </div>\n</script>\n<script type=\"text/ng-template\" id=\"portalAddress.html\">\n  <div class=\"ngCellText\">\n    <a target=\"openService\" href=\"{{row.entity.proxyUrl}}\"\n       ng-show=\"row.entity.portalIP && row.entity.$podCounters.valid\" title=\"Protocol {{row.entity.protocol}}\">\n      {{row.entity.portalIP}}:{{row.entity.port}}\n    </a>\n    <span ng-hide=\"row.entity.portalIP && row.entity.$podCounters.valid\">{{row.entity.portalIP}}:{{row.entity.port}}</span>\n  </div>\n</script>\n<script type=\"text/ng-template\" id=\"iconCellTemplate.html\">\n  <div class=\"ngCellText\">\n    <img class=\"app-icon-small\" ng-src=\"{{row.entity.$iconUrl}}\">\n  </div>\n</script>\n<script type=\"text/ng-template\" id=\"statusTemplate.html\">\n  <div class=\"ngCellText\" ng-init=\"entity=row.entity\" ng-controller=\"Kubernetes.PodStatus\" title=\"Pod {{entity.id}} is {{entity.currentState.status}}\">\n    <!-- in detail view -->\n    <p ng-show=\"data\"><strong>Status: </strong></p>\n    <i class=\"fa\" ng-class=\"statusMapping(entity.currentState.status)\"></i>\n    <span ng-show=\"data\">{{data}}</span>\n    <!-- in table -->\n    <span ng-show=\"entity.$jolokiaUrl\" ng-controller=\"Kubernetes.ConnectController\">\n      <a class=\"clickable\"\n         ng-click=\"doConnect(row.entity)\"\n         title=\"Open a new window and connect to this container\">\n        <i class=\"fa fa-sign-in\"></i>\n      </a>\n    </span>\n  </div>\n</script>\n<script type=\"text/ng-template\" id=\"resizeDialog.html\">\n  <div modal=\"resizeDialog.dialog.show\">\n      <form class=\"form-horizontal\" ng-submit=\"resizeDialog.onOk()\">\n          <div class=\"modal-header\"><h4>Resize {{resizeDialog.controller.id}}</h4></div>\n          <div class=\"modal-body\">\n            <div class=\"control-group\">\n              <label class=\"control-label\" for=\"replicas\">Replica count</label>\n\n              <div class=\"controls\">\n                <input type=\"number\" min=\"0\" id=\"replicas\" ng-model=\"resizeDialog.newReplicas\">\n              </div>\n            </div>\n\n          </div>\n          <div class=\"modal-footer\">\n            <input class=\"btn btn-primary\" type=\"submit\"\n                   ng-disabled=\"resizeDialog.newReplicas === resizeDialog.controller.currentState.replicas\"\n                   value=\"Resize\">\n            <button class=\"btn btn-warning cancel\" type=\"button\" ng-click=\"resizeDialog.close()\">Cancel</button>\n          </div>\n        </form>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"namespaceSelector.html\">\n    namespace: <select ng-model=\"kubernetes.selectedNamespace\" ng-options=\"namespace for namespace in kubernetes.namespaces\" title=\"choose the namespace - which is a selection of resources in kubernetes\">\n    </select>\n  </script>\n<div class=\"row\" ng-controller=\"Kubernetes.TopLevel\">\n  <div class=\"wiki-icon-view\" ng-controller=\"Kubernetes.FileDropController\" nv-file-drop nv-file-over uploader=\"uploader\" over-class=\"ready-drop\">\n    <div class=\"row kubernetes-view\" ng-view></div>\n  </div>\n</div>\n<div ng-controller=\"Kubernetes.ConnectController\">\n  <div hawtio-confirm-dialog=\"connect.dialog.show\" title=\"Connect to {{connect.containerName}}?\"\n       ok-button-text=\"Connect\" on-ok=\"onOK()\">\n    <div class=\"dialog-body\">\n      <p>Please enter the user name and password for {{connect.containerName}}:</p>\n\n      <div class=\"control-group\">\n        <label class=\"control-label\">User name: </label>\n\n        <div class=\"controls\">\n          <input name=\"userName\" ng-model=\"connect.userName\" type=\"text\" autofill>\n        </div>\n      </div>\n      <div class=\"control-group\">\n        <label class=\"control-label\">Password: </label>\n\n        <div class=\"controls\">\n          <input name=\"password\" ng-model=\"connect.password\" type=\"password\" autofill>\n        </div>\n      </div>\n      <div class=\"control-group\">\n        <div class=\"controls\">\n          <label class=\"checkbox\">\n            <input type=\"checkbox\" ng-model=\"connect.saveCredentials\"> Save these credentials as the default\n          </label>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>");
$templateCache.put("plugins/kubernetes/html/overview.html","<div ng-controller=\"Kubernetes.OverviewController\">\n  <script type=\"text/ng-template\" id=\"serviceBoxTemplate.html\">\n    <div class=\"row\">\n      <div class=\"col-md-3 align-left node-body\">{{entity.port}}</div>\n      <div class=\"col-md-9 align-right node-header\" title=\"{{entity.id}}\">{{entity.id}}</div>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"serviceTemplate.html\">\n    <div class=\"kubernetes-overview-row\">\n      <div class=\"kubernetes-overview-cell\">\n        <div id=\"{{service._key}}\"\n             namespace=\"{{service.namespace}}\"\n             connect-to=\"{{service.connectTo}}\"\n             data-type=\"service\"\n             class=\"jsplumb-node kubernetes-node kubernetes-service-node\"\n             ng-controller=\"Kubernetes.OverviewBoxController\"\n             ng-init=\"entity=getEntity(\'service\', \'{{service._key}}\')\"\n             ng-mouseenter=\"mouseEnter($event)\"\n             ng-mouseleave=\"mouseLeave($event)\"\n             ng-click=\"viewDetails(entity, \'services\')\">\n          <div ng-init=\"entity=entity\" ng-include=\"\'serviceBoxTemplate.html\'\"></div>\n        </div>\n      </div>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"hostTemplate.html\">\n    <div class=\"kubernetes-overview-row\">\n      <div class=\"kubernetes-overview-cell\">\n        <div id=\"{{host.id}}\"\n             data-type=\"host\"\n             class=\"kubernetes-host-container\">\n          <h5><a ng-href=\"/kubernetes/hosts/{{host.id}}\">{{host.id}}</a></h5>\n          <div class=\"pod-container\"></div>\n        </div>\n      </div>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"podTemplate.html\">\n    <div id=\"{{pod._key}}\"\n         data-type=\"pod\"\n         title=\"Pod ID: {{pod.id}}\"\n         class=\"jsplumb-node kubernetes-node kubernetes-pod-node\"\n         ng-mouseenter=\"mouseEnter($event)\"\n         ng-mouseleave=\"mouseLeave($event)\"\n         ng-controller=\"Kubernetes.OverviewBoxController\"\n         ng-init=\"entity=getEntity(\'pod\', \'{{pod._key}}\')\"\n         ng-click=\"viewDetails(entity, \'pods\')\">\n      <div class=\"css-table\">\n        <div class=\"css-table-row\">\n          <div class=\"pod-status-cell css-table-cell\">\n            <span ng-init=\"row={ entity: entity }\" ng-include=\"\'statusTemplate.html\'\"></span>\n          </div>\n          <div class=\"pod-label-cell css-table-cell\">\n            <span ng-init=\"row={ entity: entity }\" ng-include=\"\'labelTemplate.html\'\"></span>\n          </div>\n        </div>\n      </div>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"replicationControllerTemplate.html\">\n    <div class=\"kubernetes-overview-row\">\n      <div class=\"kubernetes-overview-cell\">\n        <div\n            id=\"{{replicationController._key}}\"\n            title=\"{{replicationController.id}}\"\n            data-type=\"replicationController\"\n            data-placement=\"top\"\n            connect-to=\"{{replicationController.connectTo}}\"\n            ng-mouseenter=\"mouseEnter($event)\"\n            ng-mouseleave=\"mouseLeave($event)\"\n            class=\"jsplumb-node kubernetes-replicationController-node kubernetes-node\"\n            ng-controller=\"Kubernetes.OverviewBoxController\"\n            ng-init=\"entity=getEntity(\'replicationController\', \'{{replicationController._key}}\')\"\n            ng-click=\"viewDetails(entity, \'replicationControllers\')\">\n            <img class=\"app-icon-medium\" ng-src=\"{{replicationController.$iconUrl}}\">\n        </div>\n      </div>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"overviewTemplate.html\">\n    <div class=\"kubernetes-overview\"\n         hawtio-jsplumb\n         draggable=\"false\"\n         layout=\"false\"\n         node-sep=\"50\"\n         rank-sep=\"300\">\n      <div class=\"kubernetes-overview-row\">\n        <div class=\"kubernetes-overview-cell\">\n          <div class=\"kubernetes-overview services\">\n            <h6>Services</h6>\n          </div>\n        </div>\n        <div class=\"kubernetes-overview-cell\">\n          <div class=\"kubernetes-overview hosts\">\n            <h6>Hosts and Pods</h6>\n          </div>\n        </div>\n        <div class=\"kubernetes-overview-cell\">\n          <div class=\"kubernetes-overview replicationControllers\">\n            <h6>Replication controllers</h6>\n          </div>\n        </div>\n      </div>\n   </div>\n  </script>\n  <div class=\"align-center\" ng-include=\"\'namespaceSelector.html\'\"></div>\n  <kubernetes-overview ui-if=\"kubernetes.selectedNamespace\"></kubernetes-overview>\n</div>\n");
$templateCache.put("plugins/kubernetes/html/pod.html","<div ng-controller=\"Kubernetes.PodController\">\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <button class=\"btn btn-danger pull-right\"\n              title=\"Delete this Pod\"\n              ng-click=\"deleteEntity()\">\n        <i class=\"fa fa-remove\"></i> Delete\n      </button>\n      <span class=\"pull-right\">&nbsp;</span>\n      <a class=\"btn btn-default pull-right\"\n              href=\"/kubernetes/pods?namespace={{item.namespace}}\"><i class=\"fa fa-list\"></i></a>\n      <div ng-show=\"item.$jolokiaUrl\" ng-controller=\"Kubernetes.ConnectController\">\n        <span class=\"pull-right\">&nbsp;</span>\n        <a class=\"btn btn-primary pull-right\"\n           ng-click=\"doConnect(item)\"\n           title=\"Open a new window and connect to this container\">\n          <i class=\"fa fa-sign-in\"></i> Connect\n        </a>\n      </div>\n    </div>\n  </div>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <div ng-hide=\"model.fetched\">\n        <div class=\"align-center\">\n          <i class=\"fa fa-spinner fa-spin\"></i>\n        </div>\n      </div>\n      <div ng-show=\"model.fetched\">\n        <div hawtio-object=\"item\" config=\"itemConfig\"></div>\n      </div>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/kubernetes/html/pods.html","<div class=\"row\" ng-controller=\"Kubernetes.Pods\">\n  <script type=\"text/ng-template\" id=\"imageTemplate.html\">\n    <div class=\"ngCellText\">\n      <!-- in table -->\n      <span ng-hide=\"data\">\n        <span ng-repeat=\"container in row.entity.desiredState.manifest.containers\">\n          <a target=\"dockerRegistry\" href=\"https://registry.hub.docker.com/u/{{container.image}}\" title=\"{{container.name}}\">{{container.image}}</a>\n        </span>\n      </span>\n      <!-- in detail view -->\n      <span ng-show=\"data\">\n        <a target=\"dockerRegistry\" ng-href=\"https://registry.hub.docker.com/u/{{data}}\" title=\"{{data}}\">{{data}}</a>\n      </span>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"configDetail.html\">\n    <pre>{{data}}</pre>\n  </script>\n  <script type=\"text/ng-template\" id=\"envItemTemplate.html\">\n    <span ng-controller=\"Kubernetes.EnvItem\">\n      <span class=\"blue\">{{key}}</span>=<span class=\"green\">{{value}}</span>\n    </span>\n  </script>\n  <div class=\"row filter-header\">\n    <div class=\"col-md-12\" ng-hide=\"model.pods.length\">\n      <span ng-include=\"\'namespaceSelector.html\'\"></span>\n      <p></p>\n    </div>\n    <div class=\"col-md-12\" ng-show=\"model.pods.length\">\n      <span ng-include=\"\'namespaceSelector.html\'\"></span>\n      <span ng-show=\"!id\">\n        <hawtio-filter ng-model=\"tableConfig.filterOptions.filterText\"\n                       css-class=\"input-xxlarge\"\n                       placeholder=\"Filter pods...\"></hawtio-filter>\n      </span>\n      <button ng-show=\"model.fetched\"\n              class=\"btn btn-danger pull-right\"\n              ng-disabled=\"!id && tableConfig.selectedItems.length == 0\"\n              ng-click=\"deletePrompt(id || tableConfig.selectedItems)\">\n        <i class=\"fa fa-remove\"></i> Delete\n      </button>\n      <span class=\"pull-right\">&nbsp;</span>\n      <button ng-show=\"id\"\n              class=\"btn btn-primary pull-right\"\n              ng-click=\"id = undefined\"><i class=\"fa fa-list\"></i></button>\n      <span class=\"pull-right\">&nbsp;</span>\n      <button ng-show=\"hasService(\'kibana-service\')\"\n              class=\"btn pull-right\"\n              title=\"View the logs for the selected pods\"\n              ng-disabled=\"!id && tableConfig.selectedItems.length == 0\"\n              ng-click=\"openLogs()\">Logs</button>\n    </div>\n  </div>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <div ng-hide=\"model.fetched\">\n        <div class=\"align\">\n          <i class=\"fa fa-spinner fa-spin\"></i>\n        </div>\n      </div>\n      <div ng-show=\"model.fetched\">\n        <div ng-hide=\"model.pods.length\" class=\"align-center\">\n          <p class=\"alert alert-info\">There are no pods currently running.</p>\n        </div>\n        <div ng-show=\"model.pods.length\">\n          <table class=\"table table-condensed table-striped\" ui-if=\"kubernetes.selectedNamespace\"\n                 hawtio-simple-table=\"tableConfig\"></table>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/kubernetes/html/replicationController.html","<div ng-controller=\"Kubernetes.ReplicationControllerController\">\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <button class=\"btn btn-danger pull-right\"\n              title=\"Delete this ReplicationController\"\n              ng-click=\"deleteEntity()\">\n        <i class=\"fa fa-remove\"></i> Delete\n      </button>\n      <span class=\"pull-right\">&nbsp;</span>\n      <a class=\"btn btn-default pull-right\"\n         title=\"Return to table of controllers\"\n              href=\"/kubernetes/replicationControllers?namespace={{item.namespace}}\"><i class=\"fa fa-list\"></i></a>\n      <span class=\"pull-right\">&nbsp;</span>\n      <a class=\"btn btn-primary pull-right\"\n              ng-click=\"resizeDialog.open(item)\"\n              title=\"Resize the number of replicas of this controller\">Resize</a>\n      <span class=\"pull-right\">&nbsp;</span>\n      <span class=\"pull-right controller-pod-counts\" ng-show=\"item.$podCounters\">Pods:\n        <a ng-show=\"item.$podCounters.podsLink\" href=\"{{item.$podCounters.podsLink}}\" title=\"View pods\">\n          <span ng-show=\"item.$podCounters.valid\" class=\"badge badge-success\">{{item.$podCounters.valid}}</span>\n          <span ng-show=\"item.$podCounters.waiting\" class=\"badge\">{{item.$podCounters.waiting}}</span>\n          <span ng-show=\"item.$podCounters.error\" class=\"badge badge-warning\">{{item.$podCounters.error}}</span>\n        </a>\n      </span>\n    </div>\n  </div>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <div ng-hide=\"model.fetched\">\n        <div class=\"align-center\">\n          <i class=\"fa fa-spinner fa-spin\"></i>\n        </div>\n      </div>\n      <div ng-show=\"model.fetched\">\n        <div hawtio-object=\"item\" config=\"itemConfig\"></div>\n      </div>\n    </div>\n  </div>\n  <ng-include src=\"\'resizeDialog.html\'\"/>\n</div>\n");
$templateCache.put("plugins/kubernetes/html/replicationControllers.html","<div ng-controller=\"Kubernetes.ReplicationControllers\">\n  <script type=\"text/ng-template\" id=\"currentReplicasTemplate.html\">\n    <div class=\"ngCellText\" title=\"Number of running pods for this controller\">\n      <a ng-show=\"row.entity.podsLink\" href=\"{{row.entity.podsLink}}\">\n        <span class=\"badge {{row.entity.currentState.replicas > 0 ? \'badge-success\' : \'badge-warning\'}}\">{{row.entity.currentState.replicas}}</span>\n      </a>\n      <span ng-hide=\"row.entity.podsLink\" class=\"badge\">{{row.entity.currentState.replicas}}</span>\n    </div>\n  </script>\n  <script type=\"text/ng-template\" id=\"desiredReplicas.html\">\n    <div class=\"ngCellText\">\n      <span class=\"btn btn-sm\" ng-click=\"$parent.$parent.resizeDialog.open(row.entity)\" title=\"Edit the number of replicas of this controller\">{{row.entity.desiredState.replicas}}</span>\n    </div>\n  </script>\n  <div class=\"row filter-header\">\n    <div class=\"col-md-12\" ng-hide=\"model.replicationControllers.length\">\n      <span ng-include=\"\'namespaceSelector.html\'\"></span>\n    </div>\n    <div class=\"col-md-12\" ng-show=\"model.replicationControllers.length\">\n      <span ng-include=\"\'namespaceSelector.html\'\"></span>\n      <span ng-show=\"!id\">\n        <hawtio-filter ng-model=\"tableConfig.filterOptions.filterText\"\n                       css-class=\"input-xxlarge\"\n                       placeholder=\"Filter replication controllers...\"\n                       save-as=\"kubernetes-replication-controllers-text-filter\"></hawtio-filter>\n      </span>\n      <button ng-show=\"model.fetched\"\n              class=\"btn btn-danger pull-right\"\n              ng-disabled=\"!id && tableConfig.selectedItems.length == 0\"\n              ng-click=\"deletePrompt(id || tableConfig.selectedItems)\">\n        <i class=\"fa fa-remove\"></i> Delete\n      </button>\n      <span class=\"pull-right\">&nbsp;</span>\n      <button ng-show=\"id\"\n              class=\"btn btn-primary pull-right\"\n              ng-click=\"id = undefined\"><i class=\"fa fa-list\"></i></button>\n    </div>\n  </div>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <div ng-hide=\"model.fetched\">\n        <div class=\"align-center\">\n          <i class=\"fa fa-spinner fa-spin\"></i>\n        </div>\n      </div>\n      <div ng-show=\"model.fetched\">\n        <div ng-hide=\"model.replicationControllers.length\" class=\"align-center\">\n          <p class=\"alert alert-info\">There are no replication controllers currently available.</p>\n        </div>\n        <div ng-show=\"model.replicationControllers.length\">\n          <table class=\"table table-condensed table-striped\"\n                 hawtio-simple-table=\"tableConfig\"></table>\n        </div>\n      </div>\n    </div>\n  </div>\n  <ng-include src=\"\'resizeDialog.html\'\"/>\n</div>\n");
$templateCache.put("plugins/kubernetes/html/service.html","<div ng-controller=\"Kubernetes.ServiceController\">\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <button class=\"btn btn-danger pull-right\"\n              title=\"Delete this Service\"\n              ng-click=\"deleteEntity()\">\n        <i class=\"fa fa-remove\"></i> Delete\n      </button>\n      <span class=\"pull-right\">&nbsp;</span>\n      <a class=\"btn btn-default pull-right\"\n              href=\"/kubernetes/services?namespace={{item.namespace}}\"><i class=\"fa fa-list\"></i></a>\n    </div>\n  </div>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <div ng-hide=\"model.fetched\">\n        <div class=\"align-center\">\n          <i class=\"fa fa-spinner fa-spin\"></i>\n        </div>\n      </div>\n      <div ng-show=\"model.fetched\">\n        <div hawtio-object=\"item\" config=\"itemConfig\"></div>\n      </div>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/kubernetes/html/services.html","<div ng-controller=\"Kubernetes.Services\">\n  <div class=\"row filter-header\">\n    <div class=\"col-md-12\" ng-hide=\"model.services.length\">\n      <span ng-include=\"\'namespaceSelector.html\'\"></span>\n    </div>\n    <div class=\"col-md-12\" ng-show=\"model.services.length\">\n      <span ng-include=\"\'namespaceSelector.html\'\"></span>\n      <span ng-show=\"!id\">\n        <hawtio-filter ng-model=\"tableConfig.filterOptions.filterText\"\n                       css-class=\"input-xxlarge\"\n                       placeholder=\"Filter services...\"\n                       save-as=\"kubernetes-services-text-filter\"></hawtio-filter>\n      </span>\n      <button ng-show=\"model.fetched\"\n              class=\"btn btn-danger pull-right\"\n              ng-disabled=\"!id && tableConfig.selectedItems.length == 0\"\n              ng-click=\"deletePrompt(id || tableConfig.selectedItems)\">\n        <i class=\"fa fa-remove\"></i> Delete\n      </button>\n      <span class=\"pull-right\">&nbsp;</span>\n      <button ng-show=\"id\"\n              class=\"btn btn-primary pull-right\"\n              ng-click=\"id = undefined\"><i class=\"fa fa-list\"></i></button>\n    </div>\n  </div>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <div ng-hide=\"model.fetched\">\n        <div class=\"align-center\">\n          <i class=\"fa fa-spinner fa-spin\"></i>\n        </div>\n      </div>\n      <div ng-show=\"model.fetched\">\n        <div ng-hide=\"model.services.length\" class=\"align-center\">\n          <p class=\"alert alert-info\">There are no services currently available.</p>\n        </div>\n        <div ng-show=\"model.services.length\">\n          <table class=\"table table-condensed table-striped\" ui-if=\"kubernetes.selectedNamespace\"\n                 hawtio-simple-table=\"tableConfig\"></table>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>\n");}]); hawtioPluginLoader.addModule("hawtio-kubernetes-templates");