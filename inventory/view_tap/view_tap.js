'use strict';

angular.module('myApp.viewOnTap', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewOnTap', {
    templateUrl: 'view_tap/view_tap.html',
    controller: 'ViewOnTapCtrl'
  });
}])

.controller('ViewOnTapCtrl', function($scope, $http) {

  $scope.empty_taps = true;

  $scope.taps = [];

  // do fake taps for now

  $scope.addNewTap = function() {
    console.log('add');
    var tap_num = $scope.taps.length;
    var tap_name = "Tap #" + tap_num.toString();
    $scope.taps.push(
    {
      name: tap_name,
      is_tapped: true,
      product: 'Anchorsteam'
    });
  };

});