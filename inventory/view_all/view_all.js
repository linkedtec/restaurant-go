'use strict';

angular.module('myApp.viewAllInv', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewAllInv', {
    templateUrl: 'view_all/view_all.html',
    controller: 'ViewAllInvCtrl'
  });
}])

.controller('ViewAllInvCtrl', function($scope, $http) {

  $scope.addNewItem = function(item) {
    console.log('add item ' + item);

    // check if it's empty
    if (item == undefined || item == '')
    {
      console.log('empty item, quitting...');
      return;
    }

    // check if item is already in $scope.inventory_items
    for (var item_i in $scope.inventory_items) {
      var existing = $scope.inventory_items[item_i];
      if (existing.name == item)
      {
        console.log(item + ' is already in inventory!');
        // XXX Change this to red text on page instead of alert
        alert(item + ' is already in inventory!');
        return;
      }
    }
    $http.post('/inv', {name:item}).
      success(function(data, status, headers, config) {
        // this callback will be called asynchronously when the response
        // is available
        console.log(data);
        // XXX if success, add returned item to $scope.inventory_items
        // otherwise, notify of failure and don't add
        $scope.inventory_items.push({name:item, quantity:0, last_update:''})
      }).
      error(function(data, status, headers, config) {
    });
  };

  $http.get('/inv').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      $scope.inventory_items = data;
    }).
    error(function(data, status, headers, config) {

    });

});