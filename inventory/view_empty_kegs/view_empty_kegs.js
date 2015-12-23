'use strict';

angular.module('myApp.viewEmptyKegs', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewEmptyKegs', {
      templateUrl: 'view_empty_kegs/view_empty_kegs.html',
      controller: 'ViewInvByLocCtrl',
      resolve: {
        locType: function() {
          return "kegs";
        }
      }
    });
}]);
