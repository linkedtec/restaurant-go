'use strict';

angular.module('myApp.viewAllInv', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewAllInv', {
    templateUrl: 'view_all/view_all.html',
    controller: 'ViewAllInvCtrl'
  });
}])

.controller('ViewAllInvCtrl', function($scope, $modal, $http) {

  $scope.show_add_ui = false;
  $scope.alcohol_types = ["Draft Beer", "Bottle Beer", "Wine", "Bar Consumables", "N/A Bev"];
  $scope.volume_units = ["L", "mL", "oz", "pt", "qt", "gal"];
  $scope.new_success_msg = null;
  $scope.new_failure_msg = null;

  // sorting
  $scope.sort_key = null;
  $scope.double_sort = -1;
  $scope.firstTimeSort = true;

  $scope.clearNewForm = function() {
    $scope.new_product = null;
    $scope.new_brewery = null;
    $scope.new_distributor = null;
    // don't clear type, user might want to preserve for next entry
    //$scope.new_type = $scope.alcohol_types[0];
    $scope.new_abv = null;
    $scope.new_purchase_volume = null;
    $scope.new_purchase_unit = $scope.volume_units[0];
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
        text: "Bars that serve Draft Beer from kegs often pay deposits per keg to their distributor.  If this doesn't apply to you, leave it blank."
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
      size_prices:$scope.add_sales
    }).
      success(function(data, status, headers, config) {
        // this callback will be called asynchronously when the response
        // is available
        //console.log(data);
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

      /* Add custom params
      for (var i = 0; i < $scope.inventory_items.length; i++) {
        $scope.inventory_items[i]['count'] = i;
      }*/

      if ($scope.firstTimeSort) {
        $scope.firstTimeSort = false;
        $scope.sortBy('product');
      }
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.sortBy = function(sort_str) {
    //console.log('SORTY BY ' + sort_str)
    var double_sort = sort_str === $scope.sort_key;
    if (double_sort) {
      $scope.double_sort *= -1;
    } else {
      $scope.double_sort = -1;
    }
    $scope.sort_key = sort_str;
    var isNum = (sort_str === 'abv' || sort_str === 'purchase_volume' || sort_str === 'purchase_unit' || sort_str === 'purchase_cost' || sort_str === 'deposit' || sort_str === 'count');
    $scope.inventory_items.sort(function(a, b) {
      var keyA = a[sort_str];
      var keyB = b[sort_str];
      if ($scope.double_sort > 0) {
        if (isNum)
        {
          return keyA > keyB;
        }
        return -keyA.localeCompare(keyB);
      }
      if (isNum)
      {
        return keyA < keyB;
      }
      return keyA.localeCompare(keyB);
    })
  };

  $scope.addSaleRow = function(unit) {
    $scope.add_sales.push({volume:null, unit:unit, price:null});
  };

  $scope.removeSaleRow = function(index) {
    $scope.add_sales.splice(index, 1);
  };

  $scope.editBeverage = function(index) {
    var modalEditInstance = $modal.open({
      templateUrl: 'editInvModal.html',
      controller: 'editInvModalCtrl',
      size: 'lg',
      windowClass: 'app-modal-window',
      resolve: {
        beverage: function() {
          return $scope.inventory_items[index];
        },
        volume_units: function() {
          return $scope.volume_units;
        },
        alcohol_types: function() {
          return $scope.alcohol_types;
        }
      }
    });

    modalEditInstance.result.then(
      // success status
      function( result ) {
        // the only time the modal calls success status is to pass that 
        // a beverage has been deleted.  result is the id of the deleted bev
        console.log('Deleting beverage id: ' + result);
        for (var i = $scope.inventory_items.length-1; i >= 0; i--) {
          var bev = $scope.inventory_items[i];
          if (bev.id === result) {
            $scope.inventory_items.splice(i, 1);
            break;
          }
        }
      }, 
      // error status
      function() {
        ;
      })
  };

  $scope.getAllInv();
})

.controller('editInvModalCtrl', function($scope, $modalInstance, $http, beverage, volume_units, alcohol_types) {

  // original_beverage is a pointer back to the inventory object instance
  // and should be written to on save.
  // beverage is a clone of the original beverage so edits do not affect existing
  // beverage object until user saves
  $scope.original_beverage = beverage;
  $scope.beverage = JSON.parse( JSON.stringify( beverage ) );
  $scope.volume_units = volume_units;
  $scope.alcohol_types = alcohol_types;

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

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

  $scope.addSaleRow = function(unit) {
    $scope.beverage.size_prices.push({volume:null, unit:unit, price:null});
  };

  $scope.removeSaleRow = function(index) {
    $scope.beverage.size_prices.splice(index, 1);
  };

  $scope.showAbVHelp = function() {
    swal({
        title:"What is %AbV?", 
        text: "Percent Alcohol by Volume indicates the alcoholic content of your beverage."
      });
      return;
  };

  $scope.showKegHelp = function() {
    swal({
        title:"What is a Keg Deposit?", 
        text: "Bars that serve Draft Beer from kegs often pay deposits per keg to their distributor.  If this doesn't apply to you, leave it blank."
      });
      return;
  };

  $scope.showPurchaseHelp = function() {
    swal({
        title:"Purchase Info", 
        text: "When you order new stock from your distributor / supplier, what is the volume of an individual order item, and how much does it cost?"
      });
      return;
  };

  $scope.saveChanges = function() {
    
    $scope.new_success_msg = null;
    $scope.new_failure_msg = null;

    var all_clear = true;

    // check all necessary fields are present
    if ($scope.beverage.product === null || $scope.beverage.product === '' )
    {
      $scope.form_ver.error_product = true;
      all_clear = false;
    } else {
      $scope.form_ver.error_product = false;
    }

    if ($scope.beverage.distributor === null || $scope.beverage.distributor === '' )
    {
      $scope.form_ver.error_distributor=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_distributor=false;
    }

    if ($scope.beverage.brewery === null || $scope.beverage.brewery === '' )
    {
      $scope.form_ver.error_brewery=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_brewery=false;
    }

    if ($scope.beverage.alcohol_type === null || $scope.beverage.alcohol_type === '' )
    {
      $scope.form_ver.error_type=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_type=false;
    }

    if ($scope.beverage.abv === null || $scope.beverage.abv === '' || isNaN($scope.beverage.abv))
    {
      $scope.form_ver.error_abv=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_abv=false;
    }

    if ($scope.beverage.purchase_volume === null || $scope.beverage.purchase_volume === '' || isNaN($scope.beverage.purchase_volume))
    {
      $scope.form_ver.error_pvolume=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pvolume=false;
    }

    if ($scope.beverage.purchase_unit === null || $scope.beverage.purchase_unit === '' )
    {
      $scope.form_ver.error_punit=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_punit=false;
    }

    if ($scope.beverage.purchase_cost === null || $scope.beverage.purchase_cost === '' )
    {
      $scope.form_ver.error_pcost=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pcost=false;
    }

    // For validating sales & pricing, need:
    // at least 1 row with complete information
    // rows with partial information are incorrect
    for (var sale_i in $scope.beverage.size_prices)
    {
      var sale = $scope.beverage.size_prices[sale_i];
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

    // Find any diffs between the original and the modified object.
    // Instead of doing a comprehensive generic comparison, we rely on
    // knowing the beverage object's structure to do comparisons (e.g.,
    // the fact that size_prices is an array of objects)
    var changedKeys = [];     // store which keys changed
    for (var key in $scope.beverage) {
      if ($scope.original_beverage.hasOwnProperty(key)) {
        if (key == '__proto__' || key == '$$hashKey') {
          continue;
        }
        // handle known special cases such as size_prices
        else if (key=='size_prices') {
          var isSame = true;
          if ($scope.original_beverage.size_prices.length != $scope.beverage.size_prices.length)
          {
            changedKeys.push(key);
            continue;
          }
          for (var i in $scope.original_beverage.size_prices) {
            var osp = $scope.original_beverage.size_prices[i]
            var sp = $scope.beverage.size_prices[i];
            if (osp.price != sp.price || osp.unit != sp.unit || osp.volume != sp.volume) {
              changedKeys.push(key);
              continue;
            }
          }
        }
        else if ($scope.original_beverage[key] != $scope.beverage[key]) {
          changedKeys.push(key);
        }
      }
    }
    if (changedKeys.length == 0) {
      $modalInstance.dismiss('save');
      return;
    }

    // clone our tmp beverage to the original beverage object to commit the
    // changes on the client side.
    for (var key in $scope.beverage) {
      if ($scope.original_beverage.hasOwnProperty(key)) {
        $scope.original_beverage[key] = $scope.beverage[key];
      }
    }

    // now put the values of the *changed* keys to the server
    var putObj = {};
    for (var i in changedKeys) {
      var key = changedKeys[i];
      putObj[key] = $scope.beverage[key];
    }
    putObj.id = $scope.beverage.id;

    $http.put('/inv', {
      beverage:putObj,
      change_keys:changedKeys
    });

    $modalInstance.dismiss('save');
  };

  $scope.deleteItem = function() {
    var bev_id = $scope.original_beverage.id;

    swal({
      title: "Delete Beverage?",
      text: "This will remove " + $scope.original_beverage.product + " from the DB, and from all inventory locations which carry it.  This cannot be undone.",
      type: "warning",
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $http.delete('/inv', {
          params: {
            id:bev_id
        }
      }).
      success(function(data, status, headers, config) {
        // communicate with ViewAllInvCtrl to delete its entry
        $modalInstance.close(bev_id);
      }).
      error(function(data, status, headers, config) {
        console.log(data);
      });
    });
  };

});





