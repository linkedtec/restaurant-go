'use strict';

angular.module('myApp.viewAllInv', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewAllInv', {
    templateUrl: 'view_all/view_all.html',
    controller: 'ViewAllInvCtrl'
  });
}])

.controller('ViewAllInvCtrl', function($scope, $http) {

  $scope.show_add_ui = false;
  $scope.alcohol_types = ["Beer", "Wine"];
  $scope.purchase_units = ["L", "mL", "oz", "pt", "qt", "gal"];
  $scope.new_success_msg = null;
  
  $scope.clearNewForm = function() {
    $scope.new_product = null;
    $scope.new_brewery = null;
    $scope.new_distributor = null;
    // don't clear type, user might want to preserve for next entry
    //$scope.new_type = $scope.alcohol_types[0];
    $scope.new_abv = null;
    $scope.new_purchase_volume = null;
    $scope.new_purchase_unit = $scope.purchase_units[0];
    $scope.new_purchase_cost = null;
    $scope.new_deposit = null;
    $scope.new_flavor_profile = null;
  };

  $scope.clearNewForm();
  $scope.new_type = $scope.alcohol_types[0];

  $scope.showAbVHelp = function() {
    swal({
        title:"What is %AbV?", 
        text: "Percent Alcohol by Volume indicates the alcoholic content of your beverage."
      });
      return;
  }

  $scope.showPurchaseHelp = function() {
    swal({
        title:"Purchase Info", 
        text: "When you order new stock from your distributor / supplier, what is the size of an individual item, and how much does it cost?"
      });
      return;
  }

  // Shows the add new inventory item UI box
  $scope.showAddInv = function() {
    $scope.show_add_ui=true;
    $scope.new_inv_msg = "";
    $scope.new_success_msg = null;
  };

  $scope.hideAddInv = function() {
    $scope.show_add_ui=false;
  };

  $scope.addNewItem = function() {
    
    // check all necessary fields are present
    if ($scope.new_product === null || $scope.new_product === '' )
    {
      swal({
        title:"Missing Information", 
        text: "Please fill out the Product Name!"
      });
      return;
    }

    if ($scope.new_type === null || $scope.new_type === '' )
    {
      swal({
        title:"Missing Information", 
        text: "Please fill out the Product Type!"
      });
      return;
    }

    if ($scope.new_distributor === null || $scope.new_distributor === '' )
    {
      swal({
        title:"Missing Information", 
        text: "Please fill out the Product's Distributor!"
      });
      return;
    }

    if ($scope.new_brewery === null || $scope.new_brewery === '' )
    {
      swal({
        title:"Missing Information", 
        text: "Please fill out the Product's Brewery!"
      });
      return;
    }

    if ($scope.new_abv === null || $scope.new_abv === '' )
    {
      swal({
        title:"Missing Information", 
        text: "Please fill out the Product's AbV!"
      });
      return;
    }

    if ($scope.new_purchase_volume === null || $scope.new_purchase_volume === '' )
    {
      swal({
        title:"Missing Information", 
        text: "Please fill out the Product's Purchase Volume!"
      });
      return;
    }

    if ($scope.new_purchase_unit === null || $scope.new_purchase_unit === '' )
    {
      swal({
        title:"Missing Information", 
        text: "Please fill out the Product's Purchase Unit!"
      });
      return;
    }

    if ($scope.new_purchase_cost === null || $scope.new_purchase_cost === '' )
    {
      swal({
        title:"Missing Information", 
        text: "Please fill out the Product's Purchase Cost!"
      });
      return;
    }

    // check if item is already in $scope.inventory_items
    /*
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
    */
    $http.post('/inv', {
      product:$scope.new_product,
      brewery:$scope.new_brewery,
      distributor:$scope.new_distributor,
      alcohol_type:$scope.new_type,
      abv:$scope.new_abv,
      purchase_volume:$scope.new_purchase_volume,
      purchase_unit:$scope.new_purchase_unit,
      purchase_cost:$scope.new_purchase_cost,
      deposit:$scope.new_deposit,
      flavor_profile:$scope.new_flavor_profile
    }).
      success(function(data, status, headers, config) {
        // this callback will be called asynchronously when the response
        // is available
        console.log(data);
        // XXX if success, add returned item to $scope.inventory_items
        // otherwise, notify of failure and don't add
        //$scope.inventory_items.push({name:item, quantity:0, last_update:''})
        $scope.new_success_msg = $scope.new_product + " has been added to your inventory!";
        $scope.getAllInv();
        $scope.clearNewForm();
      }).
      error(function(data, status, headers, config) {
    });
  };

  $scope.getAllInv = function() {
    $http.get('/inv').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      $scope.inventory_items = data;
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getAllInv();
});