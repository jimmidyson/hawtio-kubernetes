/// <reference path="../../includes.ts"/>
/// <reference path="kubernetesHelpers.ts"/>
/// <reference path="kubernetesPlugin.ts"/>
/// <reference path="kubernetesModel.ts"/>

module Kubernetes {

  /**
   * Represents a simple interface to service discovery that can be used early on in the application lifecycle before the
   * underlying model has been created via dependency injection
   */
  export class ServiceRegistryService {
    private model:KubernetesModelService = null;

    /**
     * Returns true if there is a service available for the given ID or false
     */
    public hasService(serviceName: string) {
      return this.findService(serviceName) ? true : false;
    }

    /**
     * Returns the service for the given service name (ID) or null if it cannot be found
     *
     * @param serviceName the name of the service to look for
     * @return {null}
     */
    public findService(serviceName: string) {
      var answer = null;
      if (serviceName) {
        var model = this.getModel();
        if (model) {
          var namespace = model.currentNamespace();
          return model.getService(namespace ,serviceName);
/*
        TODO lets only look in the current namespace
        angular.forEach(model.services, (service) => {
          if (serviceName === service.id) {
            answer = service;
          }
        });
*/
        }
      }
      return answer;
    }

    /**
     * Returns the service link for the given service name
     *
     * @param serviceName the name of the service
     * @return {null}
     */
    public serviceLink(serviceName: string): string {
      var service = this.findService(serviceName);
      if (service) {
        var portalIP = service.$host;
        // lets assume no custom port for now for external routes
        var port = null;
        if (!portalIP) {
          portalIP = service.portalIP;
          port = service.port;
        }

        // TODO use annotations to support other kinds of protocol?
        var protocol = "http://";

        if (portalIP) {
          if (port) {
            return protocol + portalIP + ":" + port + "/";
          } else {
            return protocol + portalIP;
          }
        }
      }
      return "";
    }

    protected getModel():KubernetesModelService {
      var answer = this.model;
      // lets allow lazy load so we can be invoked before the injector has been created
      if (!answer) {
        var injector = HawtioCore.injector;
        if (injector) {
          this.model = injector.get('KubernetesModel');
        }
      }
      answer = this.model;
      return answer;
    }
  }
}