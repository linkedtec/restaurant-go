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
  $scope.all_distributors = [];
  $scope.all_breweries = [];
  $scope.container_types = ["-- Select One --", "Keg", "Bottle", "Can"];
  $scope.serve_types = ["-- Select One --", "Single Serve", "Multiple Pours"];
  $scope.beverage_types = ["Beer", "Cider", "Wine", "Liquor", "Non Alcoholic"];
  $scope.alcohol_types = ["Draft Beer", "Bottle Beer", "Wine", "Draft Cider", "Bottle Cider", "Bar Consumables", "N/A Bev"];
  $scope.volume_units = ["L", "mL", "oz", "pt", "qt", "gal"];
  //$scope.add_type = $scope.beverage_types[0];
  $scope.new_success_msg = null;
  $scope.new_failure_msg = null;
  $scope.cost_units = ['Cost / mL', 'Cost / oz'];
  $scope.selected_cost_unit = 'Cost / mL';

  $scope.new_beverage = {};
  $scope.new_beverage['container_type'] = $scope.container_types[0];
  $scope.new_beverage['serve_type'] = $scope.serve_types[0];
  $scope.new_beverage['alcohol_type'] = $scope.beverage_types[0];

  //$scope.new_container_type = $scope.container_types[0];
  //$scope.new_serve_type = $scope.serve_types[0];

  // sorting
  $scope.sort_key = null;
  $scope.double_sort = -1;
  $scope.firstTimeSort = true;

  $scope.show_col_ctrl = false;
  $scope.highlight_cols = null;

  $scope.col_comps = {
    supplier: true,
    purchase: true,
    retail: true,
    inventory: true,
    misc: true
  }

  $scope.clearNewForm = function() {
    //$scope.new_container_type = $scope.container_types[0];
    //$scope.new_serve_type = $scope.serve_types[0];
    $scope.new_beverage['product'] = null;
    $scope.new_beverage['brewery'] = null;
    $scope.new_beverage['distributor'] = null;
    // don't clear type, user might want to preserve for next entry
    $scope.new_beverage['abv'] = null;
    $scope.new_beverage['purchase_volume'] = null;
    $scope.new_beverage['purchase_unit'] = "L";
    $scope.new_beverage['purchase_cost'] = null;
    $scope.new_beverage['purchase_count'] = 1;
    $scope.new_beverage['deposit'] = null;
    $scope.new_beverage['flavor_profile'] = null;
    $scope.new_beverage['size_prices'] = [{volume:null, unit:"L", price:null}];
    $scope.new_unit_sale = null;

    // form verification
    $scope.form_ver = {};
    $scope.form_ver.error_container = false;
    $scope.form_ver.error_serve_type = false;
    $scope.form_ver.error_product = false;
    //$scope.form_ver.error_distributor = false;
    //$scope.form_ver.error_brewery = false;
    $scope.form_ver.error_type = false;
    $scope.form_ver.error_abv = false;
    $scope.form_ver.error_pvolume = false;
    $scope.form_ver.error_punit = false;
    $scope.form_ver.error_pcost = false;
    $scope.form_ver.error_keg_deposit = false;
    $scope.form_ver.error_pcount = false;
    $scope.form_ver.error_unit_sale = false;
    $scope.form_ver.errors_sale_volume = [];
    $scope.form_ver.errors_sale_price = [];
  };

  $scope.clearNewForm();

  $scope.selectCostUnit = function(cost_unit) {
    $scope.selected_cost_unit = cost_unit;

    for (var i = 0; i < $scope.inventory_items.length; i++) {
      $scope.inventory_items[i]['price_per_volume'] = $scope.getPricePerVolume(
        $scope.inventory_items[i]['purchase_volume'],
        $scope.inventory_items[i]['purchase_unit'],
        $scope.inventory_items[i]['purchase_cost'],
        $scope.inventory_items[i]['purchase_count']);
    }
  };

  $scope.numIsInvalid = function(num) {
    return isNaN(num) || num < 0;
  };

  $scope.getPricePerVolume = function(vol, unit, cost, count) {

    // returning -1 means invalid

    if (vol === null || cost === null) {
      return -1;
    }

    // if volume is 0, return negative number
    if (vol == 0) {
      return -1;
    }

    var in_liters = 0;
    for (var i=0; i < $scope.volume_units_full.length; i++){
      var vol_unit = $scope.volume_units_full[i];
      if (unit === vol_unit['abbr_name']) {
        in_liters = vol_unit['in_liters'];
        break;
      }
    }

    var vol_in_liters = in_liters * vol;

    var cost_per_mL = cost / count / vol_in_liters / 1000.0;

    // if display is cost / mL
    if ($scope.selected_cost_unit.indexOf('mL') >= 0) {
      return cost_per_mL;
    }
    // if display is cost / oz
    else {
      return cost_per_mL * 29.5735;
    }
  };

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

  $scope.selectAddType = function(type) {
    $scope.new_beverage['alcohol_type'] = type;
    if ($scope.new_beverage['alcohol_type'] === 'Beer' || $scope.new_beverage['alcohol_type'] === 'Cider') {
      $scope.container_types = ["-- Select One --", "Keg", "Bottle", "Can"];
    } else {
      $scope.container_types = ["-- Select One --", "Bottle", "Can"];
      if ($scope.new_beverage['container_type'] === 'Keg') {
        $scope.new_beverage['container_type'] = 'Bottle';
      }
    }

    // when switching to beer, if already have a container and serve type
    // set, automatically change serve type to single serve, unless container
    // is keg
    if (($scope.new_beverage['alcohol_type'] === 'Beer' || $scope.new_beverage['alcohol_type'] === 'Cider') && $scope.new_beverage['container_type'] !== $scope.container_types[0] && $scope.new_beverage['serve_type'] !== $scope.serve_types[0] && $scope.new_beverage['container_type'] !== "Keg") {
      $scope.new_beverage['serve_type'] = $scope.serve_types[1];
      return;
    }

    // when switching to wine / liquor, if already have a container and serve type
    // set, automatically change serve type to multiple pours, unless it's a can
    if (($scope.new_beverage['alcohol_type'] === 'Wine' || $scope.new_beverage['alcohol_type'] === 'Liquor') && $scope.new_beverage['container_type'] !== $scope.container_types[0] && $scope.new_beverage['serve_type'] !== $scope.serve_types[0] && $scope.new_beverage['container_type'] !== "Can") {
      $scope.new_beverage['serve_type'] = $scope.serve_types[2];
      return;
    }

    // when switching to non alcoholic, if already have a container and serve type
    // set, automatically change serve type to single serve
    if ($scope.new_beverage['alcohol_type'] === 'Non Alcoholic' && $scope.new_beverage['container_type'] !== $scope.container_types[0] && $scope.new_beverage['serve_type'] !== $scope.serve_types[0]) {
      $scope.new_beverage['serve_type'] = $scope.serve_types[1];
      return;
    }
  };

  $scope.addContainerChanged = function() {
    if ($scope.new_beverage['container_type'] === 'Keg') {
      $scope.new_beverage['serve_type'] = $scope.serve_types[2];
      $scope.new_unit_sale = null;
      $scope.new_beverage['purchase_count'] = 1;
    } else if ($scope.new_beverage['container_type'] === 'Can' && $scope.new_beverage['serve_type'] !== $scope.serve_types[0]) {
      $scope.new_beverage['serve_type'] = $scope.serve_types[1];
    } else if (($scope.new_beverage['alcohol_type'] === 'Beer' || $scope.new_beverage['alcohol_type'] === 'Cider') && $scope.new_beverage['serve_type'] !== $scope.serve_types[0]) {
      $scope.new_beverage['serve_type'] = $scope.serve_types[1];
    } else if (($scope.new_beverage['alcohol_type'] === 'Wine' || $scope.new_beverage['alcohol_type'] === 'Liquor') && $scope.new_beverage['serve_type'] !== $scope.serve_types[0] && $scope.new_beverage['container_type'] === 'Bottle') {
      $scope.new_beverage['serve_type'] = $scope.serve_types[2];
    }
  };

  $scope.addNewItem = function() {
    
    $scope.new_success_msg = null;
    $scope.new_failure_msg = null;

    var all_clear = true;

    // check all necessary fields are present
    if ($scope.new_beverage['product'] === null || $scope.new_beverage['product'] === '' )
    {
      $scope.form_ver.error_product = true;
      all_clear = false;
    } else {
      $scope.form_ver.error_product = false;
    }

    if ($scope.new_beverage['container_type'] === null || $scope.new_beverage['container_type'] === '' || $scope.new_beverage['container_type'] === $scope.container_types[0] )
    {
      $scope.form_ver.error_container=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_container=false;
    }

    if ($scope.new_beverage['serve_type'] === null || $scope.new_beverage['serve_type'] === '' || $scope.new_beverage['serve_type'] === $scope.serve_types[0] )
    {
      $scope.form_ver.error_serve_type=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_serve_type=false;
    }

    if ( $scope.numIsInvalid($scope.new_beverage['abv']) )
    {
      $scope.form_ver.error_abv=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_abv=false;
    }

    if ( $scope.new_beverage['purchase_volume'] !== null && $scope.new_beverage['purchase_volume'] !== '' && $scope.numIsInvalid($scope.new_beverage['purchase_volume']) )
    {
      $scope.form_ver.error_pvolume=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pvolume=false;
    }

    if ($scope.new_beverage['purchase_unit'] === null || $scope.new_beverage['purchase_unit'] === '' )
    {
      $scope.form_ver.error_punit=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_punit=false;
    }

    if ($scope.new_beverage['purchase_cost'] === null || $scope.new_beverage['purchase_cost'] === '' || $scope.numIsInvalid($scope.new_beverage['purchase_cost']) )
    {
      $scope.form_ver.error_pcost=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pcost=false;
    }

    if ( $scope.new_beverage['purchase_count'] === null || $scope.numIsInvalid($scope.new_beverage['purchase_count']) )
    {
      $scope.form_ver.error_pcount=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pcount=false;
    }

    if ($scope.new_unit_sale !== null && $scope.new_unit_sale !== '' && $scope.numIsInvalid($scope.new_unit_sale) )
    {
      $scope.form_ver.error_unit_sale=true;
      all_clear=false;
    } else {
      $scope.form_ver.error_unit_sale=false;
    }

    // the unit sale is a special entry we need to push into size_prices,
    // with volume 1, unit "Unit", and price of new_unit_sale
    //
    // Should add when:
    // For Multi Pour, only if not keg
    // For Single Serve, always
    if ($scope.form_ver.error_unit_sale === false) 
    {
      // always add for single serve
      if ($scope.new_beverage['serve_type'] === $scope.serve_types[1] || $scope.new_beverage['container_type'] !== "Keg") {
        // unshift places the entry at head of array
        $scope.new_beverage['size_prices'].unshift({'volume':1, 'unit':'Unit', 'price':$scope.new_unit_sale})
      }
    }

    // Collect the final list of size prices.  Careful to do the following:
    // 1. If serve_type is single, discard any size_prices not of Unit type
    var final_size_prices = []
    for (var sale_i in $scope.new_beverage['size_prices'])
    {
      var sale = $scope.new_beverage['size_prices'][sale_i];
      var serve_type = $scope.new_beverage['serve_type'];
      if ( serve_type === $scope.serve_types[2] || (serve_type === $scope.serve_types[1] && sale['unit'] === 'Unit') )
      {
        final_size_prices.push(sale);
      }
    }

    for (var sale_i in final_size_prices)
    {
      var sale = final_size_prices[sale_i];
      if (sale.volume !== null && sale.volume !== '' && $scope.numIsInvalid(sale.volume)
        || sale.unit == null || sale.unit == '' ) {
        $scope.form_ver.errors_sale_volume[sale_i] = true;
        all_clear = false;
      } else if (sale.price !== null && sale.price !== '' && $scope.numIsInvalid(sale.price)) {
        $scope.form_ver.errors_sale_price[sale_i] = true;
        all_clear = false;
      } else {
        $scope.form_ver.errors_sale_price[sale_i] = false;
      }
    }

    $scope.new_beverage['size_prices'] = final_size_prices;

    if (!all_clear) {
      $scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.  If you don't know the numeric value for a field, set it to '0'.";
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

    // serve_type is an int on the server, not a string.  Need to convert
    // $scope.new_serve_type to an int
    var serve_type_int = 0;   // default to single serve, which is 0 on server
    // multi serve is 1 on server
    if ($scope.new_beverage['serve_type'] === $scope.serve_types[2]) {
      serve_type_int = 1;
    }

    $http.post('/inv', {
      container_type:$scope.new_beverage['container_type'],
      serve_type:serve_type_int,
      product:$scope.new_beverage['product'],
      brewery:$scope.new_beverage['brewery'],
      distributor:$scope.new_beverage['distributor'],
      alcohol_type:$scope.new_beverage['alcohol_type'],
      abv:$scope.new_beverage['abv'],
      purchase_volume:$scope.new_beverage['purchase_volume'],
      purchase_unit:$scope.new_beverage['purchase_unit'],
      purchase_count:$scope.new_beverage['purchase_count'],
      purchase_cost:$scope.new_beverage['purchase_cost'],
      deposit:$scope.new_beverage['deposit'],
      flavor_profile:$scope.new_beverage['flavor_profile'],
      size_prices:$scope.new_beverage['size_prices']
    }).
      success(function(data, status, headers, config) {
        console.log('post return')
        console.log(data)
        // this callback will be called asynchronously when the response
        // is available
        //console.log(data);
        // XXX if success, add returned item to $scope.inventory_items
        // otherwise, notify of failure and don't add
        //$scope.inventory_items.push({name:item, quantity:0, last_update:''})
        $scope.new_success_msg = $scope.new_beverage['product'] + " has been added to your inventory!";
        //$scope.getAllInv();

        data['count'] = 0;
        data['inventory'] = 0;
        $scope.inventory_items.push(data);
        // if distributor or brewery is a new entry, add them to the typeahead 
        // arrays
        if ($scope.all_distributors.indexOf($scope.new_beverage['distributor']) < 0) {
          $scope.all_distributors.push($scope.new_beverage['distributor']);
        }
        if ($scope.all_breweries.indexOf($scope.new_beverage['brewery']) < 0) {
          $scope.all_breweries.push($scope.new_beverage['brewery']);
        }
        // calculate new price per volume for added item
        for (var i = 0; i < $scope.inventory_items.length; i++) {
          $scope.inventory_items[i]['price_per_volume'] = $scope.getPricePerVolume(
            $scope.inventory_items[i]['purchase_volume'],
            $scope.inventory_items[i]['purchase_unit'],
            $scope.inventory_items[i]['purchase_cost'],
            $scope.inventory_items[i]['purchase_count']);
        }

        $scope.clearNewForm();

        // finally, reapply sort twice to sort with newly added entry included
        $scope.sortBy($scope.sort_key);
        $scope.sortBy($scope.sort_key);
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

      for (var i = 0; i < $scope.inventory_items.length; i++) {
        var inv = $scope.inventory_items[i];

        // if size_prices is null, make them empty array
        if (inv.size_prices === null) {
          $scope.inventory_items[i].size_prices = [];
        }

        // calculate inventory
        var value = inv['purchase_cost'] / inv['purchase_count'] * inv['count'];
        $scope.inventory_items[i]['inventory'] = value;

        // calculate price per volume
        $scope.inventory_items[i]['price_per_volume'] = $scope.getPricePerVolume(
          $scope.inventory_items[i]['purchase_volume'],
          $scope.inventory_items[i]['purchase_unit'],
          $scope.inventory_items[i]['purchase_cost'],
          $scope.inventory_items[i]['purchase_count']);

        // add breweries and distributors to all_breweries and all_distributors
        // for typeahead convenience when adding new beverages, which might
        // come from same distributor / brewery
        var exists = $scope.all_distributors.indexOf(inv['distributor']) >= 0;
        if (!exists) {
          $scope.all_distributors.push(inv['distributor']);
        }
        exists = $scope.all_breweries.indexOf(inv['brewery']) >= 0;
        if (!exists) {
          $scope.all_breweries.push(inv['brewery']);
        }
      }

      if ($scope.firstTimeSort) {
        $scope.firstTimeSort = false;
        $scope.sortBy('product');
      }
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.sortBy = function(sort_str) {
    var double_sort = sort_str === $scope.sort_key;
    if (double_sort) {
      $scope.double_sort *= -1;
    } else {
      $scope.double_sort = -1;
    }
    $scope.sort_key = sort_str;
    var isNum = (sort_str === 'abv' || sort_str === 'purchase_volume' || sort_str === 'purchase_cost' || sort_str === 'purchase_count' || sort_str === 'deposit' || sort_str === 'count' || sort_str === 'inventory' || sort_str === 'price_per_volume' || sort_str === 'serve_type');
    
    $scope.inventory_items.sort(function(a, b) {
      var keyA = a[sort_str];
      var keyB = b[sort_str];
      if ($scope.double_sort > 0) {
        if (keyA === null) {
          return -1;
        } else if (keyB === null) {
          return 1;
        }
        if (isNum)
        {
          return parseFloat(keyA) - parseFloat(keyB);
        } else {
          return -keyA.localeCompare(keyB);
        }
      }
      if (keyA === null) {
        return 1;
      } else if (keyB === null) {
        return -1;
      }
      if (isNum)
      {
        return parseFloat(keyB) - parseFloat(keyA);
      } else {
        return keyA.localeCompare(keyB);
      }
    });
  };

  $scope.addSaleRow = function(unit) {
    $scope.new_beverage['size_prices'].push({volume:null, unit:unit, price:null});
  };

  $scope.removeSaleRow = function(index) {
    $scope.new_beverage['size_prices'].splice(index, 1);
  };

  $scope.editBeverage = function(index) {
    var modalEditInstance = $modal.open({
      templateUrl: 'editInvModal.html',
      controller: 'editInvModalCtrl',
      windowClass: 'edit-inv-modal',
      backdropClass: 'edit-inv-modal-backdrop',
      resolve: {
        beverage: function() {
          return $scope.inventory_items[index];
        },
        beverage_types: function() {
          return $scope.beverage_types;
        },
        container_types: function() {
          return $scope.container_types;
        },
        serve_types: function() {
          return $scope.serve_types;
        },
        volume_units: function() {
          return $scope.volume_units;
        },
        alcohol_types: function() {
          return $scope.alcohol_types;
        },
        all_distributors: function() {
          return $scope.all_distributors;
        },
        all_breweries: function() {
          return $scope.all_breweries;
        }
      }
    });

    modalEditInstance.result.then(
      // success status
      function( result ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is beverage id
        var status = result[0];
        var bev_id = result[1];
        if (status === 'delete') {
          var bev_name;
          for (var i = $scope.inventory_items.length-1; i >= 0; i--) {
            var bev = $scope.inventory_items[i];
            if (bev.id === bev_id) {
              bev_name = bev.product;
              $scope.inventory_items.splice(i, 1);
              break;
            }
          }
          swal({
            title: "Beverage Deleted!",
            text: "<b>" + bev_name + "</b> has been removed from the system.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (status === 'save') {
          var bev_name;
          for (var i=0; i < $scope.inventory_items.length; i++) {
            var bev = $scope.inventory_items[i];
            if (bev.id === bev_id) {
              $scope.inventory_items[i]['price_per_volume'] = $scope.getPricePerVolume(bev.purchase_volume, bev.purchase_unit, bev.purchase_cost, bev.purchase_count);
              bev_name = bev.product;

              // If brewery or distributor is a new entry, add to typeahead arr
              if ($scope.all_distributors.indexOf(bev.distributor) < 0) {
                $scope.all_distributors.push(bev.distributor);
              }
              if ($scope.all_breweries.indexOf(bev.brewery) < 0) {
                $scope.all_breweries.push(bev.brewery);
              }

              break;
            }
          }
          swal({
            title: "Beverage Updated!",
            text: "<b>" + bev_name + "</b> has been updated with your changes.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
        }
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.showColumnsCtrl = function() {
    if (!$scope.show_col_ctrl) {
      $scope.show_col_ctrl = true;
    } else {
      $scope.show_col_ctrl = false;
    }
  };

  $scope.showAllColumns = function() {
    for (var comp in $scope.col_comps) {
      $scope.col_comps[comp] = true;
    }
  };

  $scope.unhighlightCols = function() {
    $scope.highlight_cols = null;
  };

  $scope.highlightCols = function(comp) {
    $scope.highlight_cols = comp;
  };

  $scope.getVolUnits = function() {
    $http.get('/volume_units').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      $scope.volume_units_full = data;
      $scope.volume_units = [];
      for (var i=0; i < data.length; i++)
      {
        $scope.volume_units.push(data[i].abbr_name);
      }
      // need to first load vol units before getting all inv
      $scope.getAllInv();
    }).
    error(function(data, status, headers, config) {

    });
  }

  $scope.getVolUnits();
})

.controller('editInvModalCtrl', function($scope, $modalInstance, $http, beverage, beverage_types, container_types, serve_types, volume_units, alcohol_types, all_distributors, all_breweries) {

  $scope.beverage_types = beverage_types;
  $scope.container_types = container_types;
  $scope.serve_types = serve_types;
  $scope.tab_beverage_types = [];
  // original_beverage is a pointer back to the inventory object instance
  // and should be written to on save.
  // beverage is a clone of the original beverage so edits do not affect existing
  // beverage object until user saves
  $scope.original_beverage = beverage;
  $scope.beverage = JSON.parse( JSON.stringify( beverage ) );

  $scope.volume_units = volume_units;
  $scope.alcohol_types = alcohol_types;
  $scope.all_distributors = all_distributors;
  $scope.all_breweries = all_breweries;
  $scope.unit_sale = null;

  // form verification
  $scope.form_ver = {};
  $scope.form_ver.error_container = false;
  $scope.form_ver.error_serve_type = false;
  $scope.form_ver.error_product = false;
  $scope.form_ver.error_type = false;
  $scope.form_ver.error_abv = false;
  $scope.form_ver.error_pvolume = false;
  $scope.form_ver.error_punit = false;
  $scope.form_ver.error_pcost = false;
  $scope.form_ver.error_pcount = false;
  $scope.form_ver.error_keg_deposit = false;
  $scope.form_ver.errors_sale_volume = [];
  $scope.form_ver.errors_sale_price = [];

  // Need to convert beverage.serve_type, which is an int, to a string
  if ($scope.beverage.serve_type === 0) {
    $scope.beverage.serve_type = $scope.serve_types[1];
  } else {
    $scope.beverage.serve_type = $scope.serve_types[2];
  }

  // need to handle unit sale price separate from other sale prices
  if ($scope.beverage['size_prices'] !== null) {
    for (var i = 0; i < $scope.beverage.size_prices.length; i++)
    {
      var sp = $scope.beverage.size_prices[i];
      if (sp.unit === 'Unit') {
        $scope.unit_sale = sp.price;
        $scope.beverage.size_prices.splice(i,1);
        break;
      }
    }
  };

  $scope.addSaleRow = function(unit) {
    $scope.beverage.size_prices.push({volume:null, unit:unit, price:null});
  };

  $scope.removeSaleRow = function(index) {
    $scope.beverage.size_prices.splice(index, 1);
  };

  if ($scope.beverage['size_prices'] === null || $scope.beverage['size_prices'].length == 0) {
    $scope.beverage['size_prices'] = [];
    $scope.addSaleRow('L');
  }

  for (var i=0; i < $scope.beverage_types.length; i++) {
    $scope.tab_beverage_types.push(
      {
        name: $scope.beverage_types[i], 
        active: false });
    if ($scope.beverage.alcohol_type === $scope.tab_beverage_types[i].name) {
      $scope.tab_beverage_types[i].active = true;
    }
  }
  
  console.log($scope.beverage);
  
  $scope.selectAddType = function(type) {
    $scope.beverage.alcohol_type = type;
    console.log(type);
    if ($scope.beverage.alcohol_type === 'Beer' || $scope.beverage.alcohol_type === 'Cider') {
      $scope.container_types = ["-- Select One --", "Keg", "Bottle", "Can"];
    } else {
      $scope.container_types = ["-- Select One --", "Bottle", "Can"];
      if ($scope.beverage.container_type === 'Keg') {
        $scope.beverage.container_type = 'Bottle';
      }
    }

    // when switching to beer, if already have a container and serve type
    // set, automatically change serve type to single serve, unless container
    // is keg
    if (($scope.beverage.alcohol_type === 'Beer' || $scope.beverage.alcohol_type === 'Cider') && $scope.beverage.container_type !== $scope.container_types[0] && $scope.beverage.serve_type !== $scope.serve_types[0] && $scope.beverage.container_type !== "Keg") {
      $scope.beverage.serve_type = $scope.serve_types[1];
      return;
    }

    // when switching to wine / liquor, if already have a container and serve type
    // set, automatically change serve type to multiple pours, unless it's a can
    if (($scope.beverage.alcohol_type === 'Wine' || $scope.beverage.alcohol_type === 'Liquor') && $scope.beverage.container_type !== $scope.container_types[0] && $scope.beverage.serve_type !== $scope.serve_types[0] && $scope.beverage.container_type !== "Can") {
      $scope.beverage.serve_type = $scope.serve_types[2];
      return;
    }

    // when switching to non alcoholic, if already have a container and serve type
    // set, automatically change serve type to single serve
    if ($scope.beverage.alcohol_type === 'Non Alcoholic' && $scope.beverage.container_type !== $scope.container_types[0] && $scope.beverage.serve_type !== $scope.serve_types[0]) {
      $scope.beverage.serve_type = $scope.serve_types[1];
      return;
    }
  };

  $scope.addContainerChanged = function() {
    if ($scope.beverage['container_type'] === 'Keg') {
      $scope.beverage['serve_type'] = $scope.serve_types[2];
      $scope.unit_sale = null;
      $scope.new_beverage['purchase_count'] = 1;
    } else if ($scope.beverage['container_type'] === 'Can' && $scope.beverage['serve_type'] !== $scope.serve_types[0]) {
      $scope.beverage['serve_type'] = $scope.serve_types[1];
    } else if (($scope.beverage['alcohol_type'] === 'Beer' || $scope.beverage['alcohol_type'] === 'Cider') && $scope.beverage['serve_type'] !== $scope.serve_types[0]) {
      $scope.beverage['serve_type'] = $scope.serve_types[1];
    } else if (($scope.beverage['alcohol_type'] === 'Wine' || $scope.beverage['alcohol_type'] === 'Liquor') && $scope.beverage['serve_type'] !== $scope.serve_types[0] && $scope.beverage['container_type'] === 'Bottle') {
      $scope.beverage['serve_type'] = $scope.serve_types[2];
    }
  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
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
    // check all necessary fields are present
    if ($scope.beverage['product'] === null || $scope.beverage['product'] === '' )
    {
      $scope.form_ver.error_product = true;
      all_clear = false;
    } else {
      $scope.form_ver.error_product = false;
    }

    if ($scope.beverage['container_type'] === null || $scope.beverage['container_type'] === '' || $scope.beverage['container_type'] === $scope.container_types[0] )
    {
      $scope.form_ver.error_container=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_container=false;
    }

    if ($scope.beverage['serve_type'] === null || $scope.beverage['serve_type'] === '' || $scope.beverage['serve_type'] === $scope.serve_types[0] )
    {
      $scope.form_ver.error_serve_type=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_serve_type=false;
    }

    if ( $scope.numIsInvalid($scope.beverage['abv']) )
    {
      $scope.form_ver.error_abv=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_abv=false;
    }

    if ( $scope.beverage['purchase_volume'] !== null && $scope.beverage['purchase_volume'] !== '' && $scope.numIsInvalid($scope.beverage['purchase_volume']) )
    {
      $scope.form_ver.error_pvolume=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pvolume=false;
    }

    if ($scope.beverage['purchase_unit'] === null || $scope.beverage['purchase_unit'] === '' )
    {
      $scope.form_ver.error_punit=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_punit=false;
    }

    if ($scope.beverage['purchase_cost'] === null || $scope.beverage['purchase_cost'] === '' || $scope.numIsInvalid($scope.beverage['purchase_cost']) )
    {
      $scope.form_ver.error_pcost=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pcost=false;
    }

    if ( $scope.beverage['purchase_count'] === null || $scope.numIsInvalid($scope.beverage['purchase_count']) )
    {
      $scope.form_ver.error_pcount=true;
      all_clear = false;
    } else {
      $scope.form_ver.error_pcount=false;
    }

    if ($scope.unit_sale !== null && $scope.unit_sale !== '' && $scope.numIsInvalid($scope.unit_sale) )
    {
      $scope.form_ver.error_unit_sale=true;
      all_clear=false;
    } else {
      $scope.form_ver.error_unit_sale=false;
    }

    if ($scope.form_ver.error_unit_sale === false) 
    {
      // always add for single serve
      if ($scope.beverage['serve_type'] === $scope.serve_types[1] || $scope.beverage['container_type'] !== "Keg") {
        // unshift places the entry at head of array
        $scope.beverage['size_prices'].unshift({'volume':1, 'unit':'Unit', 'price':$scope.unit_sale})
      }
    }

    // Collect the final list of size prices.  Careful to do the following:
    // 1. If serve_type is multi and volume and price both null, discard
    // 2. If serve_type is single, discard any size_prices not of Unit type
    var final_size_prices = []
    for (var sale_i in $scope.beverage['size_prices'])
    {
      var sale = $scope.beverage['size_prices'][sale_i];
      var serve_type = $scope.beverage['serve_type'];
      // if multi and both volume and price null, is empty entry; discard
      if (serve_type === $scope.serve_types[2] && sale['price'] === null && sale['volume'] === null) {
        continue;
      }
      // if single and not Unit entry, discard
      if (serve_type === $scope.serve_types[1] && sale['unit'] !== 'Unit') {
        continue;
      }
      final_size_prices.push(sale);
    }

    for (var sale_i in final_size_prices)
    {
      var sale = final_size_prices[sale_i];
      if (sale.volume !== null && sale.volume !== '' && $scope.numIsInvalid(sale.volume)
        || sale.unit == null || sale.unit == '' ) {
        $scope.form_ver.errors_sale_volume[sale_i] = true;
        all_clear = false;
      } else if (sale.price !== null && sale.price !== '' && $scope.numIsInvalid(sale.price)) {
        $scope.form_ver.errors_sale_price[sale_i] = true;
        all_clear = false;
      } else {
        $scope.form_ver.errors_sale_price[sale_i] = false;
      }
    }

    $scope.beverage['size_prices'] = final_size_prices;

    if (!all_clear) {
      $scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.  If you don't know the value for a field, set it to '0'.";
      return;
    }

    // Need to convert serve_type back to an int
    // Need to convert beverage.serve_type, which is an int, to a string
    if ($scope.beverage.serve_type === $scope.serve_types[1]) {
      $scope.beverage.serve_type = 0;
    } else {
      $scope.beverage.serve_type = 1;
    }

    // Find any diffs between the original and the modified object.
    // Instead of doing a comprehensive generic comparison, we rely on
    // knowing the beverage object's structure to do comparisons (e.g.,
    // the fact that size_prices is an array of objects)
    var changedKeys = [];     // store which keys changed
    for (var key in $scope.beverage) {
      if ($scope.original_beverage.hasOwnProperty(key)) {
        if (key === '__proto__' || key === '$$hashKey') {
          continue;
        }
        // handle known special cases such as size_prices
        else if (key==='size_prices') {
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
      $modalInstance.dismiss();
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

    $modalInstance.close(['save', $scope.beverage.id]);
  };

  $scope.numIsInvalid = function(num) {
    return isNaN(num) || num < 0;
  };

  $scope.deleteItem = function() {
    var bev_id = $scope.original_beverage.id;

    swal({
      title: "Delete Beverage?",
      text: "This will remove <b>" + $scope.original_beverage.product + "</b> from the DB, and from all inventory locations which carry it.  This cannot be undone.",
      type: "warning",
      showCancelButton: true,
      html: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: false },
      function() {
        $http.delete('/inv', {
          params: {
            id:bev_id
        }
        }).
        success(function(data, status, headers, config) {
          // communicate with ViewAllInvCtrl to delete its entry
          $modalInstance.close(['delete', bev_id]);
        }).
        error(function(data, status, headers, config) {
          console.log(data);
        });
    });
  };

});





