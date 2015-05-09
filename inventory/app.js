'use strict';

// Declare app level module which depends on views, and components
angular.module('myApp', [
  'ngRoute',
  'myApp.viewAllInv',
  'myApp.viewInvByLoc',
  'myApp.viewOnTap',
  'myApp.viewHistory'
]).
config(['$routeProvider', function($routeProvider) {
  $routeProvider.otherwise({redirectTo: '/viewAllInv'});
}])

.controller('myAppCtrl', function($scope, $location) {

  $scope.isActive = function (viewLocation) {
    var active = (viewLocation === $location.path());
    return active;
  };

});
