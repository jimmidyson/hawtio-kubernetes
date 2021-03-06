/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>

module Kubernetes {

  export var PodController = controller("PodController",
    ["$scope", "KubernetesModel", "KubernetesState", "$templateCache", "$location", "$routeParams", "$http", "$timeout", "KubernetesApiURL",
      ($scope, KubernetesModel: Kubernetes.KubernetesModelService, KubernetesState,
       $templateCache:ng.ITemplateCacheService, $location:ng.ILocationService, $routeParams, $http, $timeout, KubernetesApiURL) => {

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

    $scope.$on('$routeUpdate', ($event) => {
      updateData();
    });

    updateData();

    function updateData() {
      $scope.id = $routeParams["id"];
      $scope.item = $scope.model.getPod(KubernetesState.selectedNamespace, $scope.id);
      Core.$apply($scope);
    }
  }]);
}
