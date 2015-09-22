'use strict';

angular.module('myApp.viewAllInv', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewAllInv', {
    templateUrl: 'view_all/view_all.html',
    controller: 'ViewAllInvCtrl'
  });
}])

.controller('ViewAllInvCtrl', function($scope, $modal, $http, $filter, MathService, DistributorsService) {

  $scope.show_add_ui = false;
  $scope.all_distributors = [];
  $scope.all_breweries = [];
  $scope.container_types = ["-- Select One --", "Keg", "Bottle", "Can"];
  $scope.serve_types = ["-- Select One --", "Single Serve", "Multiple Pours"];
  $scope.beverage_types = ["Beer", "Cider", "Wine", "Liquor", "Non Alcoholic"];
  $scope.alcohol_types = ["Draft Beer", "Bottle Beer", "Wine", "Draft Cider", "Bottle Cider", "Bar Consumables", "N/A Bev"];
  $scope.volume_units = ["L", "mL", "oz", "pt", "qt", "gal"];
  $scope.cost_units = ['Cost / mL', 'Cost / oz'];
  $scope.selected_cost_unit = 'Cost / mL';

  $scope.newBevControl = {};

  // querying with searchbox.  Query needs to be object, not string var
  // for angular to not wonk out randomly
  $scope.all_inv_query = {query:""};

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

  /*
  // this function logic is good, but not currently being used
  $scope.getDeposit = function(bev) {
    if (bev['keg']!==undefined && bev['keg']!==null) {
      if (bev.keg.deposit!==undefined && bev.keg.deposit!==null) {
        return bev.keg.deposit;
      }
    }
    return 0;
  };
  */

  $scope.selectCostUnit = function(cost_unit) {
    $scope.selected_cost_unit = cost_unit;

    for (var i = 0; i < $scope.inventory_items.length; i++) {
      var item = $scope.inventory_items[i];
      $scope.inventory_items[i]['price_per_volume'] = $scope.getPricePerVolume(
        item['purchase_volume'],
        item['purchase_unit'],
        item['purchase_cost'],
        item['purchase_count']);
    }
  };

  $scope.getPricePerVolume = function(vol, unit, cost, count) {

    // returning -1 means invalid
    if (vol === null || cost === null) {
      return -1;
    }

    // if volume is 0, return negative number
    if (vol === 0) {
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
  };

  $scope.hideAddInv = function() {
    $scope.show_add_ui=false;
    $scope.newBevControl.clearSuccessMsg();
    $scope.newBevControl.clearNewForm();
  };

  $scope.newBeverageCloseOnSave = function(new_beverage) {
    new_beverage['count'] = 0;
    new_beverage['inventory'] = 0;

    new_beverage['price_per_volume'] = $scope.getPricePerVolume(
      new_beverage['purchase_volume'],
      new_beverage['purchase_unit'],
      new_beverage['purchase_cost'],
      new_beverage['purchase_count']
      );

    // need to populate distributor and keg based on distributor_id and keg_id
    if (new_beverage['distributor_id'] !== null) {
      var dist;
      for (var j in $scope.all_distributors) {
        dist = $scope.all_distributors[j];
        if (dist.id === new_beverage['distributor_id']) {
          new_beverage['distributor'] = dist;
          break;
        }
      }
      // if there's also a keg_id, pre-populate with keg entry
      if (new_beverage['keg_id'] !== null && dist.kegs !== null) {
        for (var j in dist.kegs) {
          var keg = dist.kegs[j];
          if (keg.id === new_beverage['keg_id']) {
            new_beverage['keg'] = keg;
            break;
          }
        }
      }
    }

    $scope.inventory_items.push(new_beverage);

    if ($scope.all_breweries.indexOf(new_beverage['brewery']) < 0) {
      $scope.all_breweries.push(new_beverage['brewery']);
    }

    $scope.newBevControl.clearNewForm();

    // finally, reapply sort twice to sort with newly added entry included
    $scope.sortBy($scope.sort_key);
    $scope.sortBy($scope.sort_key);

  };

  $scope.getAllInv = function() {

    $http.get('/inv').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      $scope.inventory_items = data;

      if ($scope.inventory_items===null || $scope.inventory_items.length === 0) {
        $scope.inventory_items = [];
      }

      // process the data we get on the client
      for (var i = 0; i < $scope.inventory_items.length; i++) {
        var inv = $scope.inventory_items[i];

        // fix a list of known keys to be decimal precision 2
        var fix_num_keys = [
        'abv',
        'count',
        'purchase_cost',
        'purchase_volume',
        ];
        for (var j in fix_num_keys) {
          var fix_key = fix_num_keys[j];
          if ( inv[fix_key] !== undefined && inv[fix_key] !== null ) {
            inv[fix_key] = MathService.fixFloat2(inv[fix_key]);
          }
        }

        // if size_prices is null, make them empty array
        if (inv.size_prices === null) {
          $scope.inventory_items[i].size_prices = [];
        }
        // fix size_prices to be decimal precision 2
        for (var j in inv.size_prices) {
          inv.size_prices[j]['price'] = MathService.fixFloat2(inv.size_prices[j]['price']);
          inv.size_prices[j]['volume'] = MathService.fixFloat2(inv.size_prices[j]['volume']);
        }

        // add breweries all_breweries for typeahead convenience when adding 
        // new beverages, which might come from same brewery
        var exists = $scope.all_breweries.indexOf(inv['brewery']) >= 0;
        if (!exists) {
          $scope.all_breweries.push(inv['brewery']);
        }

        // server passes us distributor_id and keg_id, but we need to resolve
        // the distributor and keg objects based on all_distributors and all_kegs
        $scope.inventory_items[i]['distributor'] = null;
        $scope.inventory_items[i]['keg'] = null;
        // if beverage has a distributor_id, need to pre-populate its 
        // distributor entry
        if ($scope.inventory_items[i]['distributor_id'] !== null) {
          var dist;
          for (var j in $scope.all_distributors) {
            dist = $scope.all_distributors[j];
            if (dist.id === $scope.inventory_items[i]['distributor_id']) {
              $scope.inventory_items[i]['distributor'] = dist;
              break;
            }
          }
          // if there's also a keg_id, pre-populate with keg entry
          if ($scope.inventory_items[i]['keg_id'] !== null && dist.kegs !== null) {
            for (var j in dist.kegs) {
              var keg = dist.kegs[j];
              if (keg.id === $scope.inventory_items[i]['keg_id']) {
                $scope.inventory_items[i]['keg'] = keg;
                break;
              }
            }
          }
        }

        // calculate price per volume.  Do this after keg has been populated
        // otherwise deposit will be incorrect
        $scope.inventory_items[i]['price_per_volume'] = $scope.getPricePerVolume(
          $scope.inventory_items[i]['purchase_volume'],
          $scope.inventory_items[i]['purchase_unit'],
          $scope.inventory_items[i]['purchase_cost'],
          $scope.inventory_items[i]['purchase_count']);
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
    var isNum = (sort_str === 'abv' || sort_str === 'purchase_volume' || sort_str === 'purchase_cost' || sort_str === 'purchase_count' || sort_str === 'count' || sort_str === 'inventory' || sort_str === 'price_per_volume' || sort_str === 'serve_type' || sort_str === 'empty_kegs');
    var isDist = (sort_str === 'distributor');
    var isDep = (sort_str === 'deposit');
    if (isDep) sort_str = 'keg';
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
        } else if (isDist) {
          return -keyA.name.localeCompare(keyB.name);
        } else if (isDep) {
          var keyA = keyA.deposit;
          var keyB = keyB.deposit;
          if (keyA === null) return -1;
          if (keyB === null) return 1;
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
      } else if (isDist) {
        return keyA.name.localeCompare(keyB.name);
      } else if (isDep) {
        var keyA = keyA.deposit;
        var keyB = keyB.deposit;
        if (keyA === null) return -1;
        if (keyB === null) return 1;
        return parseFloat(keyB) - parseFloat(keyA);
      } else {
        return keyA.localeCompare(keyB);
      }
    });
  };

  $scope.editBeverage = function(inv) {
    var modalEditInstance = $modal.open({
      templateUrl: 'editInvModal.html',
      controller: 'editInvModalCtrl',
      windowClass: 'edit-inv-modal',
      backdropClass: 'white-modal-backdrop',
      resolve: {
        edit_beverage: function() {
          return inv;
        },
        all_distributors: function() {
          return $scope.all_distributors;
        },
        all_breweries: function() {
          return $scope.all_breweries;
        },
        volume_units: function() {
          return $scope.volume_units;
        },
        edit_mode: function() {
          return "all";
        }
      }
    });

    modalEditInstance.result.then(
      // success status
      function( result ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is the affected beverage
        var status = result[0];
        var edit_bev = result[1];
        
        if (status === 'delete') {
          var bev_index = $scope.inventory_items.indexOf(edit_bev);
          if (bev_index > -1) {
            $scope.inventory_items.splice(bev_index, 1);
          }
          swal({
            title: "Beverage Deleted!",
            text: "<b>" + edit_bev.product + "</b> has been removed from the system.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (status === 'save') {
          console.log(edit_bev);

          edit_bev['price_per_volume'] = $scope.getPricePerVolume(
            edit_bev.purchase_volume, 
            edit_bev.purchase_unit, 
            edit_bev.purchase_cost, 
            edit_bev.purchase_count);

          if ($scope.all_breweries.indexOf(edit_bev.brewery) < 0) {
            $scope.all_breweries.push(edit_bev.brewery);
          }

          swal({
            title: "Beverage Updated!",
            text: "<b>" + edit_bev.product + "</b> has been updated with your changes.",
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

  $scope.getAllDistributors = function() {

    var result = DistributorsService.get();
    result.then(
      function(payload) {
        var data = payload.data;
        
        $scope.all_distributors = data;
        console.log(data);

        // go through all kegs in all distributors and add a 'formatted'
        // attribute for displaying volume, unit, and deposit
        for (var i in $scope.all_distributors) {
          if ($scope.all_distributors[i].kegs===null) {
            $scope.all_distributors[i].kegs = [];
          }

          for (var j in $scope.all_distributors[i].kegs) {
            var keg = $scope.all_distributors[i].kegs[j];

            // fix decimal points for keg volumes to 2
            if ( keg.deposit !== undefined && keg.deposit !== null ) {
              keg.deposit = MathService.fixFloat2(keg.deposit);
            }
            if ( keg.volume !== undefined && keg.volume !== null ) {
              keg.volume = MathService.fixFloat2(keg.volume);
            }

            var formatted = keg.volume + " " + keg.unit;
            if (keg.deposit !== null) {
              formatted += " ($" + keg.deposit + " deposit)";
            }
            $scope.all_distributors[i].kegs[j]['formatted'] = formatted;
          }

          // sort kegs by volume
          $scope.all_distributors[i].kegs.sort(function(a, b) {
            if (a.volume < b.volume) return -1;
            return 1;
          });

        }

        // sort distributors by name
        $scope.all_distributors.sort(function(a, b) {
          if (a.name < b.name) return -1;
          return 1;
        });

        // after loading all distributors, load inventory
        $scope.getAllInv();

      },
      function(errorPayload) {
        ; // do nothing for now
      });
  }

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
      // need to first load vol units before getting all distributors
      $scope.getAllDistributors();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getVolUnits();
})

.controller('editInvModalCtrl', function($scope, $modalInstance, $http, $filter, MathService, edit_beverage, all_distributors, all_breweries, volume_units, edit_mode) {

  $scope.edit_beverage = edit_beverage;
  $scope.all_distributors = all_distributors;
  $scope.all_breweries = all_breweries;
  $scope.volume_units = volume_units;
  $scope.edit_mode = edit_mode;

  $scope.editBevControl = {};

  $scope.cancel = function() {
    console.log("cancel edit");
    $modalInstance.dismiss('cancel');
  };

  $scope.closeOnSave = function(new_beverage) {
    // clone our tmp beverage to the original beverage object to commit the
    // changes on the client side.

    for (var key in new_beverage) {
      if ($scope.edit_beverage.hasOwnProperty(key)) {
        $scope.edit_beverage[key] = new_beverage[key];
      }
    }

    $modalInstance.close(['save', $scope.edit_beverage]);
  };

  $scope.closeOnDelete = function() {
    $modalInstance.close(['delete', $scope.edit_beverage]);
  }

});





