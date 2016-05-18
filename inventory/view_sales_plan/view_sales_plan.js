'use strict';

angular.module('myApp.viewSalesPlan', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewSalesPlan', {
    templateUrl: 'view_sales_plan/view_sales_plan.html',
    controller: 'ViewSalesPlanCtrl'
  });
}])

.controller('ViewSalesPlanCtrl', function($scope, $modal, $http, ItemsService, DateService, BeveragesService, DistributorsService, MathService, UserService, VolUnitsService) {

  $scope.showSpinner = false;

  $scope.active_menu_count = 0;

  $scope.use_modes = ['Staples', 'Seasonal', 'Inactive'];
  $scope.use_mode = 1; // XXX hacky initialization to get sorting correct on
                       // startup by switching to mode 0
  $scope.sale_statuses = ['Staple', 'Seasonal', 'Inactive'];

  $scope.move_menus = ['Staples', 'Seasonal'];

  $scope.add_mode = 1;
  $scope.add_modes = ['Existing Beverages in DB', 'Create New Beverage']

  $scope.add_inv_all = [];
  $scope.add_inv_unadded = [];

  $scope.all_breweries = [];
  $scope.all_distributors = [];
  $scope.inventory_items = [];

  $scope.newBevControl = {};

  $scope.volume_units_full = [];
  $scope.volume_units = [];

  $scope.show_add_ui = false;

  $scope.filter_query = {'query': ''}

  $scope.addableControl = {};

  // sorting
  // these are the active sorting variables which read from either the backed 
  // up seasonal or nonseasonal saved sort state variables below
  $scope.sort_key = null;
  $scope.double_sort = 1;

  // we back up the start of nonseasonal vs seasonal sorting when changing 
  // between the two modes so we can restore the sorting when switching back
  $scope.sort_key_nonseasonal = null;
  $scope.double_sort_nonseasonal = 1;
  $scope.firstTimeSortNonseasonal = true;

  // seasonal gets its own sorting
  $scope.sort_key_seasonal = null;
  $scope.double_sort_seasonal = 1;
  $scope.firstTimeSortSeasonal = true;

  // gets the count of active menu items (Staples, Seasonals)
  // we use this to decide whether to show the Online Menu button
  $scope.getActiveMenuCount = function() {

    $http.get('/inv/menu/count')
    .success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.active_menu_count = data['count'];
      
    })
    .error(function(data, status, headers, config) {
      UserService.checkAjaxLoginRequired(data);
    });

  };
  $scope.getActiveMenuCount();

  $scope.selectUseMode = function(use_mode) {

    if (use_mode === $scope.use_modes[$scope.use_mode]) {
      return;
    }

    $scope.inventory_items = [];

    $scope.hideAddInv();

    var old_mode = $scope.use_mode;

    if (use_mode === $scope.use_modes[0]) {
      $scope.use_mode = 0;
      $scope.title_span = 7;
    } else if (use_mode === $scope.use_modes[1]) {
      $scope.use_mode = 1;
      $scope.title_span = 9;
    } else {
      $scope.use_mode = 2;
      $scope.title_span = 6;
    }

    // update the sort keys by restoring backups if going from nonseasonal to 
    // seasonal and vice versa
    // first if going from nonseasonal to seasonal
    if ($scope.use_mode === 1 && old_mode !== 1) {
      // first back up nonseasonal sort key
      $scope.sort_key_nonseasonal = $scope.sort_key;
      $scope.double_sort_nonseasonal = -$scope.double_sort;

      if ($scope.firstTimeSortSeasonal === true) {
        $scope.sort_key = 'sale_end';
        $scope.firstTimeSortSeasonal = false;
      } else {
        $scope.sort_key = $scope.sort_key_seasonal;
        $scope.double_sort = $scope.double_sort_seasonal;
      }
    }
    // else if going from seasonal to nonseasonal
    else if ($scope.use_mode !== 1 && old_mode === 1) {
      $scope.sort_key_seasonal = $scope.sort_key;
      $scope.double_sort_seasonal = -$scope.double_sort;

      if ($scope.firstTimeSortNonseasonal === true) {
        $scope.sort_key = 'product';
        $scope.firstTimeSortNonseasonal = false;
      } else {
        $scope.sort_key = $scope.sort_key_nonseasonal;
        $scope.double_sort = $scope.double_sort_nonseasonal;
      }
    }
    // else if going from nonseasonal to nonseasonal, flip double_sort
    // so it gets doubly-applied in getInvData and not flipped
    else {
      $scope.double_sort *= -1;
    }

    $scope.getInvData();
  };

  $scope.getAllDistributors = function() {

    var result = DistributorsService.get();
    result.then(
      function(payload) {
        var data = payload.data;
        
        $scope.all_distributors = data;
        console.log(data);
      },
      function(errorPayload) {
        UserService.checkAjaxLoginRequired(errorPayload.data);
      });
  };

  $scope.selectAddMode = function(mode) {
    if (mode === $scope.add_modes[$scope.add_mode]) {
      return;
    }

    $scope.add_mode = $scope.add_modes.indexOf(mode);

    if ($scope.add_mode===0) {
      $scope.addUIStyle = {width:'600px'}
      $scope.addUIHeight = {height:'480px'};
    } else {
      $scope.addUIStyle = {width:'100%'};
      $scope.addUIHeight = {height:'100%'};
    }
  };
  $scope.selectAddMode($scope.add_modes[0]);

  $scope.showAddInv = function() {
    $scope.show_add_ui=true;

    $scope.getInactiveInv();

    $scope.selectAddMode($scope.add_modes[0]);
  };

  $scope.hideAddInv = function() {
    $scope.show_add_ui=false;
  };

  $scope.getInactiveInv = function() {
    // by getting inactive inv, we are getting the inv which has not
    // been added yet
    $http.get('/inv/menu', {
      params: {
        sale_status:'Inactive'
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.add_inv_unadded = data;
      ItemsService.processBevsForAddable($scope.add_inv_unadded);

      for (var i in $scope.add_inv_unadded) {
        var item = $scope.add_inv_unadded[i];
        if ($scope.all_breweries.indexOf(item['brewery']) < 0) {
            $scope.all_breweries.push(item['brewery']);
          }
      }
      
    }).
    error(function(data, status, headers, config) {
      UserService.checkAjaxLoginRequired(data);
    });
  };
  $scope.getInactiveInv();

  $scope.calculateDates = function(item) {
    var sale_start_date = null;
    var sale_end_date = null;
    var today = new Date();
    today.setHours(0,0,0,0);

    if (DateService.isValidDate(item['sale_start'])) {
      item['sale_start_pretty'] = DateService.getPrettyDate(item['sale_start'].toString(), false, false);
      sale_start_date = item['sale_start'];
      sale_start_date.setHours(0,0,0,0);
      if (sale_start_date > today) {
        item['upcoming'] = true;
        item['days_til_sale'] = Math.abs(DateService.daysBetween(today, sale_start_date));
      } else {
        item['upcoming'] = false;
        item ['days_til_sale'] = 0;
      }
    } else {
      item['sale_start_pretty'] = '--';
      item['upcoming'] = false;
      item['days_til_sale'] = null;
    }
    if (DateService.isValidDate(item['sale_end'])) {
      item['sale_end_pretty'] = DateService.getPrettyDate(item['sale_end'].toString(), false, false);
      sale_end_date = item['sale_end'];
      sale_end_date.setHours(0,0,0,0);
      item['days_til_end'] = Math.abs(DateService.daysBetween(today, sale_end_date));
    } else {
      item['sale_end_pretty'] = '--';
      item['days_til_end'] = null;
    }
  };

  $scope.getInvData = function() {

    var type = 'Inactive';
    if ($scope.use_mode === 0) {
      type = 'Staple;';
    } else if ($scope.use_mode === 1) {
      type = 'Seasonal';
    }

    $scope.showSpinner = true;

    $http.get('/inv/menu', {
      params: {
        sale_status:type
      }
    }).
    success(function(data, status, headers, config) {

      $scope.showSpinner = false;

      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.inventory_items = data;

      if ($scope.inventory_items === null) {
        $scope.inventory_items = [];
      }

      ItemsService.processBevsForAddable($scope.inventory_items);

      for (var i in $scope.inventory_items) {
        var item = $scope.inventory_items[i];

        if ($scope.all_breweries.indexOf(item['brewery']) < 0) {
          $scope.all_breweries.push(item['brewery']);
        }

        if ($scope.use_mode===1) {
          $scope.calculateDates(item);
        }

        // calculate the color of the stock column
        // 66%+ stock = green
        // 33-66% stock = yellow
        // 0-33% stock = red
        ItemsService.calculateStockColor(item);
      }

      console.log($scope.inventory_items);

      $scope.sortBy($scope.sort_key);
      
    }).
    error(function(data, status, headers, config) {
      $scope.showSpinner = false;
      UserService.checkAjaxLoginRequired(data);
    });
  };
  //$scope.getInvData();
  $scope.selectUseMode($scope.use_modes[0]);

  // this is called when the user uses one of the calendar buttons to change the
  // start or end dates of a seasonal item
  // we pass previous_date so if end_date is before today and user decides not
  // to mvoe to Inactive, can restore to previous_date
  $scope.editDate = function(item, start_or_end, previous_date, passControl) {

    console.log(passControl);

    // first, check that end_date is not earlier than the current time.  If it
    // is, warn user that it will change this bev to inactive, and post to
    // server to change the bev to inactive
    var today = new Date();
    if (start_or_end==='end' && item.sale_end < today) {

      swal({
          title: "Make Beverage Inactive?",
          text: "This will move <b>" + item.product + "</b> to the <b>Inactive menu</b>, because the sale period has expired.  Proceed?",
          type: "warning",
          showCancelButton: true,
          html: true,
          confirmButtonColor: "#DD6B55",
          confirmButtonText: "Yes, move it!"},
          function(isConfirm) {
            if (isConfirm) {
              $scope.postEditDate(item, start_or_end, true);
              //previous_date = new Date(item.sale_end.getTime());
              passControl.setPrevDate(item.sale_end);
            } else {
              item.sale_end = new Date(previous_date.getTime());
              passControl.setPrevDate(item.sale_end);
              $scope.calculateDates(item);
            }
        });
      return;
    }

    $scope.postEditDate(item, start_or_end, false);
  };

  $scope.postEditDate = function(item, start_or_end, is_inactive) {

    var putObj = {};
    putObj.id = item.id;
    var change_keys = [];
    if (start_or_end === 'start') {
      change_keys.push('sale_start');
      putObj['sale_start'] = item.sale_start;
    } else {
      change_keys.push('sale_end');
      putObj['sale_end'] = item.sale_end;
    }
    if (is_inactive) {
      change_keys.push('sale_status');
      putObj['sale_status'] = 'Inactive';
    }

    var result = BeveragesService.put(putObj, change_keys);
    result.then(
    function(payload) {
      var new_bev_id = payload.data['id'];
      item.id = new_bev_id;

      if (is_inactive) {
        for (var i in $scope.inventory_items) {
          var check_item = $scope.inventory_items[i];
          if (check_item['version_id'] === item['version_id']) {
            $scope.inventory_items.splice(i, 1);
            break;
          }
        }
      } else {
        // update client display of date
        $scope.calculateDates(item);
      }

    },
    function(errorPayload) {
      UserService.checkAjaxLoginRequired(errorPayload.data);
    });
  };

  $scope.moveToMenu = function(item, menu) {
    if (menu === $scope.move_menus[0]) {
      $scope.showParModal(item, 0, true, false, false);
    } else if (menu === $scope.move_menus[1]) {
      $scope.showParModal(item, 1, true, false, false);
    }
  }

  $scope.showParModal = function(item, menu_type, from_inactive, from_addable, updated_distributor) {
    // this could have come from the inactive menu type (from_inactive),
    // the addable bev directive (from_addable),
    // or just as an edit on an existing item (neither)

    // first, if we're adding from the addable menu or from the inactive menu,
    // we need to make sure that the item has a proper distributor.  If it
    // does not, we show a modal first that requires them to set a distributor.
    var dist_id = item['distributor_id'];
    if (dist_id===null) {
      var modalStartInstance = $modal.open({
        templateUrl: 'modalItemDistributor.html',
        controller: 'modalItemDistributorCtrl',
        windowClass: 'inv-qty-modal',
        backdropClass: 'gray-modal-backdrop',
        backdrop : 'static',
        size: 'sm',
        resolve: {
          item: function() {
            return item;
          },
          all_distributors: function() {
            return $scope.all_distributors;
          }
        }
      });

      modalStartInstance.result.then(
        // success status
        function( result ) {
          // result is a list, first item is string for status, e.g.,
          // 'save' or 'delete'
          // second item is the affected beverage
          var status = result[0];
          var item = result[1];
          
          if (status === 'cancel') {
            item.par = null;
          }
          // after a save, we want to re-calculate cost per mL, for instance
          else if (status === 'save') {
            console.log(item);

            $scope.showParModal(item, menu_type, from_inactive, from_addable, true);
          }
          
        }, 
        // error status
        function() {
          ;
        });
      return;
    }

    console.log('show par');
    console.log(item);
    var modalStartInstance = $modal.open({
      templateUrl: 'modalParQuantity.html',
      controller: 'modalParQuantityCtrl',
      windowClass: 'inv-qty-modal',
      backdropClass: 'gray-modal-backdrop',
      backdrop : 'static',
      size: 'sm',
      resolve: {
        item: function() {
          return item;
        },
        is_seasonal: function() {
          return ( menu_type===1 );
        },
        updated_distributor: function() {
          return updated_distributor;
        }
      }
    });

    modalStartInstance.result.then(
      // success status
      function( result ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is the affected beverage
        var status = result[0];
        var item = result[1];
        
        if (status === 'cancel') {
          item.par = null;
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (status === 'save') {
          console.log(item);

          var type = 'Staple';
          if (menu_type === 0) {
            item['sale_status'] = 'Staple';
          } else if (menu_type === 1) {
            item['sale_status'] = 'Seasonal';
            type = 'Seasonal';
          } else if (menu_type === 2) {
            item['sale_status'] = 'Staple';
            type = 'Inactive';
          }

          var post_params = {
            id: item.id,
            par:item.par,
            sale_status:type
          }

          if (menu_type===1) {
            post_params['sale_start'] = DateService.clientTimeToRestaurantTime(item.sale_start);
            post_params['sale_end'] = DateService.clientTimeToRestaurantTime(item.sale_end);
          }

          console.log(post_params);

          $http.post('/inv/menu', 
            post_params).
          success(function(data, status, headers, config) {

            console.log(data);

            // if from_inactive was true, need to splice out the item
            // from the inventory_items, since we're in inactive menu
            if (from_inactive === true) {
              for (var i = 0; i < $scope.inventory_items.length; i++) {
                var check = $scope.inventory_items[i];
                if (check.version_id === item.version_id) {
                  $scope.inventory_items.splice(i, 1);
                  break;
                }
              }
              var mtitle;
              if (menu_type===0) {
                mtitle = "Staples";
              } else if (menu_type===1) {
                mtitle = "Seasonal";
              }
              swal({
                title: "Beverage Moved!",
                text: "<b>" + item.product + "</b> has been moved to the <b>" + mtitle + "</b> Menu!",
                type: "success",
                timer: 4000,
                allowOutsideClick: true,
                html: true});
            } 
            // otherwise, was added from the addable directive, and need to 
            // splice from there and push into inventory_items
            else if (from_addable === true) {
              $scope.inventory_items.push(item);

              for (var i = 0; i < $scope.add_inv_unadded.length; i++) {
                var check = $scope.add_inv_unadded[i];
                if (check.version_id === item.version_id) {
                  $scope.add_inv_unadded.splice(i, 1);
                  break;
                }
              }

              // since the addable directive does not directly reference our
              // add_inv_unadded items but made a copy of it, but does share our
              // added inventory_items, we need to call applyTypeFilter to have it
              // properly remove the item we just added from its addable items
              $scope.addableControl.applyTypeFilter();
            } else {
              // for simply editing a line item, don't need to do anything
              ;
            }

            // update client date fields for displaying start and end dates
            if (menu_type===1) {
              $scope.calculateDates(item);
            }

            if (menu_type!==2) {
              console.log('calc stock color');
              ItemsService.calculateStockColor(item);
            }
            
            
            // double sort here
            $scope.sortBy($scope.sort_key);
            $scope.sortBy($scope.sort_key);

            $scope.getActiveMenuCount();

          }).
          error(function(data, status, headers, config) {
            UserService.checkAjaxLoginRequired(data);
          });
        }
        
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.sortFunc = function(a, b) {
    var sort_str = $scope.sort_key;
    var isNum = (sort_str === 'par' || sort_str === 'count_recent');
    var isDate = (sort_str === 'sale_start' || sort_str === 'sale_end');

    var keyA = a[sort_str];
    var keyB = b[sort_str];
    if ($scope.double_sort > 0) {
      if (keyA===null || keyA===undefined) {
        return -1;
      } else if (keyB===null || keyB===undefined) {
        return 1;
      }
      if (isNum)
      {
        return parseFloat(keyA) - parseFloat(keyB);
      } else if (isDate) {
        return keyA - keyB;
      }else {
        return -keyA.localeCompare(keyB);
      }
    }
    if (keyA===null || keyA===undefined) {
      return 1;
    } else if (keyB===null || keyB===undefined) {
      return -1;
    }
    if (isNum)
    {
      return parseFloat(keyB) - parseFloat(keyA);
    } else if (isDate) {
      return keyB - keyA;
    } else {
      return keyA.localeCompare(keyB);
    }
  };

  $scope.sortBy = function(sort_str) {
    var double_sort = sort_str === $scope.sort_key;
    if (double_sort) {
      $scope.double_sort *= -1;
    } else {
      $scope.double_sort = -1;
    }
    $scope.sort_key = sort_str;

    // For sorting seasonal by dates, break inventory_items into active and
    // upcoming, sort individually, then recombine.  See sort func in
    // view_loc_new which does something similar
    /*
    var bev_items = [];
    var keg_items = [];

    for (var i in $scope.inv_items) {
      var item = $scope.inv_items[i];
      if (item.type==='bev'){
        bev_items.push(item);
      } else {
        keg_items.push(item);
      }
    }
    */

    // break down the inventory items into sublists based on alcohol_type
    // sort each of the alcohol_types individually using sortFunc
    // then merge them together.  This creates a doubly-sorted list
    // sorted by alcohol_type, and within each alcohol_type, sorted by sort_key
    var alcohol_types = [];
    var type_item_dict = {};
    for (var i in $scope.inventory_items) {
      var item = $scope.inventory_items[i];

      if (item['is_title'] === true) {
        // 'is_title' is an attribute given to rows that are just meant to be
        // displayed as a subtitle of the alcohol type
        continue;
      }
      var alc_type = item['alcohol_type'];

      // special rule: cider should be sorted with beer
      if (alc_type === 'Cider') {
        alc_type = 'Beer';
      }

      if ( alcohol_types.indexOf(alc_type) < 0 ) {
        alcohol_types.push(alc_type);
        type_item_dict[alc_type] = [];
      }

      type_item_dict[alc_type].push(item);

    }
    alcohol_types.sort();
    console.log(alcohol_types);

    var new_inventory_items = [];

    for (var i in alcohol_types) {
      var key = alcohol_types[i];
      if (type_item_dict.hasOwnProperty(key)) {
        // 'is_title' is an attribute given to rows that are just meant to be
        // displayed as a subtitle of the alcohol type
        new_inventory_items.push({product:key, is_title:true})
        new_inventory_items = new_inventory_items.concat(type_item_dict[key].sort($scope.sortFunc));
      }
    }
    $scope.inventory_items = new_inventory_items;

    //$scope.inventory_items.sort($scope.sortFunc);
  };

  $scope.editBeverage = function(inv) {

    console.log(inv);

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
          return [];
        },
        edit_mode: function() {
          return "purchase, sales";
        },
        hide_delete: function() {
          return true;
        },
        required_vars: function() {
          return ['sale_status', 'par'];
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
        
        if (status === 'save') {
          console.log(edit_bev);

          // if sale_status was changed and no longer matches the current
          // use_mode, splice the bev
          if (edit_bev['sale_status'] !== $scope.sale_statuses[$scope.use_mode]) {
            for (var i in $scope.inventory_items) {
              var check_item = $scope.inventory_items[i];
              if (check_item['version_id'] === edit_bev['version_id']) {
                console.log('splice');
                $scope.inventory_items.splice(i, 1);
                break;
              }
            }
            console.log('push');
            $scope.add_inv_unadded.push(edit_bev);
            // XXX Triggered inprog error, don't think we need this
            //$scope.$apply();
            console.log($scope.inventory_items);
            console.log($scope.add_inv_unadded);
            if ($scope.addableControl.applyTypeFilter!==undefined && $scope.addableControl.applyTypeFilter!==null) {
              $scope.addableControl.applyTypeFilter();  
            }
            
          } else {
            // recalculate pretty dates
            $scope.calculateDates(edit_bev);
            ItemsService.calculateStockColor(edit_bev);
          }

          swal({
            title: "Beverage Updated!",
            text: "<b>" + edit_bev.product + "</b> has been updated with your changes.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
        }

        $scope.getActiveMenuCount();
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.newBeverageCloseOnSave = function(new_beverage) {

    ItemsService.processBevsForAddable([new_beverage]);

    $scope.inventory_items.push(new_beverage);

    if ($scope.all_breweries.indexOf(new_beverage['brewery']) < 0) {
      $scope.all_breweries.push(new_beverage['brewery']);
    }

    $scope.calculateDates(new_beverage);

    // finally, reapply sort twice to sort with newly added entry included
    $scope.sortBy($scope.sort_key);
    $scope.sortBy($scope.sort_key);

    $scope.getActiveMenuCount();

  };

  $scope.getVolUnits = function() {

    var result = VolUnitsService.get();
    result.then(
      function(payload) {
        var data = payload.data;
        if (data !== null) {
          $scope.volume_units_full = data;
          $scope.volume_units = [];
          for (var i=0; i < data.length; i++)
          {
            $scope.volume_units.push(data[i].abbr_name);
          }
          // need to first load vol units before getting all distributors
          $scope.getAllDistributors();
        }
      },
      function(errorPayload) {
        ; // do nothing for now
      });
  };
  $scope.getVolUnits();

  $scope.viewOnlineMenu = function() {

    // GET to server, /inv/menu/page
    // get back URL for page link to web page
    // navigate with window.open

    $http.get('/inv/menu/create')
    .success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      var URL = data['url'];
      window.open(URL,'_blank');
      
    })
    .error(function(data, status, headers, config) {
      UserService.checkAjaxLoginRequired(data);
    });

  };

})

.controller('modalItemDistributorCtrl', function($scope, $modalInstance, $modal, BeveragesService, UserService, item, all_distributors) {
  $scope.item = item;
  $scope.all_distributors = all_distributors;

  $scope.distributor = null;
  $scope.keg = null;

  $scope.selectDistributor = function(dist) {
    $scope.distributor = dist;
  };

  $scope.selectKeg = function(keg) {
    $scope.keg = keg;
  };

  $scope.clearKeg = function() {
    $scope.keg = null;
  }

  $scope.addNewDistributor = function() {
    var modalNewInstance = $modal.open({
      templateUrl: 'newDistModal.html',
      controller: 'newDistModalCtrl',
      windowClass: 'new-dist-modal',
      backdropClass: 'green-modal-backdrop',
      resolve: {
        all_distributors: function() {
          return $scope.all_distributors;
        }
      }
    });

    modalNewInstance.result.then(
      // success status
      function( result ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is old dist id
        // third item is new dist id
        var status = result[0];
        var new_dist = result[1];
        if (status === 'save') {
          var dist_name = new_dist.name;
          swal({
            title: "New Distributor Added!",
            text: "<b>" + dist_name + "</b> has been added to your Distributors.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
        }
        $scope.distributor = new_dist;
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.addNewKeg = function() {
    var modalNewInstance = $modal.open({
      templateUrl: 'newKegModal.html',
      controller: 'newKegModalCtrl',
      windowClass: 'new-dist-modal',
      backdropClass: 'green-modal-backdrop',
      resolve: {
        distributor: function() {
          return $scope.distributor;
        }
      }
    });

    modalNewInstance.result.then(
      function(result) {
        var status = result[0];
        var new_keg = result[1];
        if (status === 'save') {
          $scope.keg = new_keg;
        }
      },
      // error status
      function() {
        ;
      });
  };

  $scope.save = function() {
    // assigning a distributor to a beverage is really just calling a PUT
    // with the beverage's id, with change_keys distributor_id and keg_id, 
    // and pointing to the distributor's and keg's id
    var putObj = {};
    putObj.id = $scope.item.id;
    var change_keys = [];
    if ($scope.distributor !== null) {
      change_keys.push('distributor_id');
      putObj['distributor_id'] = $scope.distributor.id;
    } 
    if ($scope.keg !== null) {
      change_keys.push('keg_id');
      putObj['keg_id'] = $scope.keg.id;
    }

    var result = BeveragesService.put(putObj, change_keys);
    result.then(
    function(payload) {
      var new_bev_id = payload.data['id'];
      $scope.item.id = new_bev_id;
      $scope.item['distributor'] = $scope.distributor;
      $scope.item['distributor_id'] = $scope.distributor.id;
      if ($scope.keg!==null) {
        $scope.item['keg_id'] = $scope.keg.id;
      }
      
      $modalInstance.close(['save', $scope.item]);

    },
    function(errorPayload) {
      UserService.checkAjaxLoginRequired(errorPayload.data);
    });
  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

})

.controller('modalParQuantityCtrl', function($scope, $modalInstance, $modal, DateService, MathService, item, is_seasonal, updated_distributor) {

  $scope.item = item;

  $scope.new_failure_msg = null;

  // if we came from a screen which required setting the beverage's distributor
  // (e.g., before adding it to the Staple / Seasonal Menu), show a hint text
  // saying it's been saved.
  $scope.updated_distributor = updated_distributor;

  $scope.quantity = null;
  if (item['par'] !== null) {
    $scope.quantity = item['par'];
  }

  $scope.show_help = false;

  $scope.is_seasonal = is_seasonal;

  $scope.form_ver = {
    'error_par': false,
    'error_start': false,
    'error_end': false
  }

  $scope.start_date = {'date':null};
  if (DateService.isValidDate(item.sale_start)) {
    $scope.start_date.date = item.sale_start;
  }
  $scope.end_date = {'date':null};
  if (DateService.isValidDate(item.sale_end)) {
    $scope.end_date.date = item.sale_end;
  }
  $scope.dateControl = {};

  $scope.initDate = function() {
    /*
    var today = new Date();
    $scope.start_date = new Date(today.setDate(today.getDate()));
    $scope.start_date.setHours(0,0,0,0);

    $scope.end_date = new Date();
    $scope.end_date.setHours(23,59,59,999);
    */
    // we don't init dates so user is forced to manually think and enter dates
    
  };
  //$scope.initDate();

  $scope.showHelp = function() {
    $scope.show_help = true;
  }

  $scope.addQuantity = function(inv, num, isAddQ) {

    if (isNaN(num) || num === null) {
      if (isAddQ) {
        inv.add_q = null;
      }
      return;
    }

    var cur_quantity = parseFloat($scope.quantity);
    var add_num = parseFloat(num);

    $scope.quantity = cur_quantity + add_num;

    if ($scope.quantity < 0) {
      $scope.quantity = 0;
    }

    $scope.quantity = MathService.fixFloat2($scope.quantity);

    if (isAddQ) {
      inv.add_q = null;
    }

  };

  $scope.save = function() {

    $scope.new_failure_msg = null;
    $scope.form_ver.error_par = false;
    $scope.form_ver.error_start = false;
    $scope.form_ver.error_end = false;

    if ($scope.is_seasonal===true) {

      var dates_valid = $scope.dateControl.validate();

      if (!dates_valid) {
        $scope.new_failure_msg = "Please enter valid Sales Period dates!";
        return;
      }

      // if end date is before today, error
      var today = new Date();
      if ($scope.end_date.date < today) {
        $scope.new_failure_msg = "The Sale End date has already passed!";
        $scope.form_ver.error_end = true;
        return;
      }

      // if end date is before start date, that's an error
      if ($scope.start_date.date > $scope.end_date.date) {
        $scope.new_failure_msg = "The Sale End date must be after the Start date!";
        $scope.form_ver.error_end = true;
        return;
      }
    }

    // first do error check
    if ($scope.quantity===null || isNaN($scope.quantity) || $scope.quantity < 0) {
      $scope.new_failure_msg = "Please enter a valid Par!";
      $scope.form_ver.error_par = true;
      return;
    }

    $scope.item.par = $scope.quantity;

    if ($scope.is_seasonal===true) {
      $scope.item.sale_start = $scope.start_date.date;
      $scope.item.sale_end = $scope.end_date.date;
    }

    $modalInstance.close(['save', $scope.item]);
    
  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

});