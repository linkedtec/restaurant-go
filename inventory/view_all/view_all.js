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
  $scope.new_failure_msg = null;
  
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
    $scope.add_sales = [{volume:null, unit:"L", price:null}];

    // form verification
    $scope.form_ver = {};
    $scope.form_ver.error_product = false;
    $scope.form_ver.error_distributor = false;
    $scope.form_ver.error_brewery = false;
    $scope.form_ver.error_type = false;
    $scope.form_ver.error_abv = false;
    $scope.form_ver.error_pvolume = false;
    $scope.form_ver.error_punit = false;
    $scope.form_ver.error_pcost = false;
    $scope.form_ver.errors_sale_volume = [];
    $scope.form_ver.errors_sale_price = [];
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

  $scope.showKegHelp = function() {
    swal({
        title:"What is a Keg Deposit?", 
        text: "Bars that serve beer from kegs often pay deposits per keg to their distributor.  If this doesn't apply to you, leave it blank."
      });
      return;
  }

  $scope.showPurchaseHelp = function() {
    swal({
        title:"Purchase Info", 
        text: "When you order new stock from your distributor / supplier, what is the volume of an individual order item, and how much does it cost?"
      });
      return;
  }

  // Shows the add new inventory item UI box
  $scope.showAddInv = function() {
    $scope.show_add_ui=true;
    $scope.new_inv_msg = "";
    $scope.new_success_msg = null;
    $scope.new_failure_msg = null;
  };

  $scope.hideAddInv = function() {
    $scope.show_add_ui=false;
    $scope.clearNewForm();
  };

  $scope.addNewItem = function() {
    
    $scope.new_success_msg = null;
    $scope.new_failure_msg = null;

    var all_clear = true;

    // check all necessary fields are present
    if ($scope.new_product === null || $scope.new_product === '' )
    {
      $scope.form_ver.error_product = true;
      all_clear = false;
    } else {
      $scope.form_ver.error_product = false;
    }

    if ($scope.new_type === null || $scope.new_type === '' )
    {
      $scope.form_ver.error_type=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_type=false;
    }

    if ($scope.new_distributor === null || $scope.new_distributor === '' )
    {
      $scope.form_ver.error_distributor=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_distributor=false;
    }

    if ($scope.new_brewery === null || $scope.new_brewery === '' )
    {
      $scope.form_ver.error_brewery=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_brewery=false;
    }

    if ($scope.new_type === null || $scope.new_type === '' )
    {
      $scope.form_ver.error_type=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_type=false;
    }

    console.log($scope.new_abv);

    if ($scope.new_abv === null || $scope.new_abv === '' || isNaN($scope.new_abv))
    {
      $scope.form_ver.error_abv=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_abv=false;
    }

    if ($scope.new_purchase_volume === null || $scope.new_purchase_volume === '' || isNaN($scope.new_purchase_volume))
    {
      $scope.form_ver.error_pvolume=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pvolume=false;
    }

    if ($scope.new_purchase_unit === null || $scope.new_purchase_unit === '' )
    {
      $scope.form_ver.error_punit=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_punit=false;
    }

    if ($scope.new_purchase_cost === null || $scope.new_purchase_cost === '' )
    {
      $scope.form_ver.error_pcost=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pcost=false;
    }

    // For validating sales & pricing, need:
    // at least 1 row with complete information
    // rows with partial information are incorrect
    for (var sale_i in $scope.add_sales)
    {
      var sale = $scope.add_sales[sale_i];
      if (sale.volume == null || sale.volume == '' || isNaN(sale.volume)
        || sale.unit == null || sale.unit == '' ) {
        $scope.form_ver.errors_sale_volume[sale_i] = true;
        all_clear = false;
      } else {
        $scope.form_ver.errors_sale_volume[sale_i] = false;
      }
      if (sale.price == null || sale.price == '' || isNaN(sale.price)) {
        $scope.form_ver.errors_sale_price[sale_i] = true;
        all_clear = false;
      } else {
        $scope.form_ver.errors_sale_price[sale_i] = false;
      }
    }

    if (!all_clear) {
      $scope.new_failure_msg = "Please correct missing or invalid fields and try again!";
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
      flavor_profile:$scope.new_flavor_profile,
      sale_prices:$scope.add_sales
    }).
      success(function(data, status, headers, config) {
        // this callback will be called asynchronously when the response
        // is available
        console.log(data);
        // XXX if success, add returned item to $scope.inventory_items
        // otherwise, notify of failure and don't add
        //$scope.inventory_items.push({name:item, quantity:0, last_update:''})
        $scope.new_success_msg = $scope.new_product + " has been added to your inventory!";
        //$scope.getAllInv();
        $scope.inventory_items.push(data)
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

  $scope.addSaleRow = function(unit) {
    $scope.add_sales.push({volume:null, unit:unit, price:null});
  };

  $scope.removeSaleRow = function(index) {
    $scope.add_sales.splice(index, 1);
  }

  $scope.getAllInv();
});