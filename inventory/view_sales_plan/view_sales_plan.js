'use strict';

angular.module('myApp.viewSalesPlan', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewSalesPlan', {
    templateUrl: 'view_sales_plan/view_sales_plan.html',
    controller: 'ViewSalesPlanCtrl'
  });
}])

.controller('ViewSalesPlanCtrl', function($scope, $modal, $http, ItemsService, DateService) {

  $scope.use_modes = ['Staples', 'Seasonal', 'Off Menu'];
  $scope.use_mode = 0;

  $scope.add_inv_all = [];
  $scope.add_inv_unadded = [];

  $scope.inventory_items = [];

  $scope.show_add_ui = false;

  $scope.addableControl = {};

  // sorting
  $scope.sort_key = null;
  $scope.double_sort = -1;
  $scope.firstTimeSort = true;

  $scope.selectUseMode = function(use_mode) {

    if (use_mode === $scope.use_modes[$scope.use_mode]) {
      return;
    }

    $scope.hideAddInv();

    if (use_mode === $scope.use_modes[0]) {
      $scope.use_mode = 0;
    } else if (use_mode === $scope.use_modes[1]) {
      $scope.use_mode = 1;
    } else {
      $scope.use_mode = 2;
    }

    $scope.getInvData();
  };

  $scope.showAddInv = function() {
    $scope.show_add_ui=true;
  };

  $scope.hideAddInv = function() {
    $scope.show_add_ui=false;
  };

  $scope.getInactiveInv = function() {
    // by getting inactive inv, we are getting the inv which has not
    // been added yet
    $http.get('/inv/menu', {
      params: {
        sale_status:'inactive'
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.add_inv_unadded = data;
      ItemsService.processBevsForAddable($scope.add_inv_unadded);
      
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getInactiveInv();

  $scope.getInvData = function() {

    var type = 'inactive';
    if ($scope.use_mode === 0) {
      type = 'staple;';
    } else if ($scope.use_mode === 1) {
      type = 'seasonal';
    }

    // currently bogus test data
    $http.get('/inv/menu', {
      params: {
        sale_status:type
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      $scope.inventory_items = data;

      if ($scope.inventory_items === null) {
        $scope.inventory_items = [];
      }

      ItemsService.processBevsForAddable($scope.inventory_items);


      if ($scope.use_mode===1){ 
        for (var i in $scope.inventory_items) {
          var item = $scope.inventory_items[i];
          item['sale_start'] = DateService.getDateFromUTCTimeStamp(
            item['sale_start'], true);
          item['sale_end'] = DateService.getDateFromUTCTimeStamp(
            item['sale_end'], true);

          item['sale_start_pretty'] = DateService.getPrettyDate(item['sale_start'].toString(), false);
          item['sale_end_pretty'] = DateService.getPrettyDate(item['sale_end'].toString(), false);

          console.log(item);
          //dlv['delivery_time'] = new Date(dlv['delivery_time']);

          //var date_str = dlv['delivery_time'].toString();
          //dlv['pretty_date'] = DateService.getPrettyDate(date_str, false);
        }
      }

      if ($scope.use_mode===1) {
        //$scope.sortSeasonal();
      } else {
        $scope.sortBy('product');
      }
      
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getInvData();

  $scope.showParModal = function(item) {
    console.log('show par');
    console.log(item);
    var modalStartInstance = $modal.open({
      templateUrl: 'modalParQuantity.html',
      controller: 'modalParQuantityCtrl',
      windowClass: 'inv-qty-modal',
      backdropClass: 'gray-modal-backdrop',
      size: 'sm',
      resolve: {
        item: function() {
          return item;
        },
        is_seasonal: function() {
          return ($scope.use_mode === 1);
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

          var type = 'staple';
          if ($scope.use_mode === 1) {
            type = 'seasonal';
          } else if ($scope.use_mode === 2) {
            type = 'inactive';
          }

          var post_params = {
            id: item.id,
            par:item.par,
            sale_status:type
          };

          if ($scope.use_mode===1) {
            post_params['sale_start'] = item.sale_start;
            post_params['sale_end'] = item.sale_end;
          }

          $http.post('/inv/menu', 
            post_params).
          success(function(data, status, headers, config) {

            console.log(data);

            $scope.inventory_items.push(item);

            for (var i = 0; i < $scope.add_inv_unadded.length; i++) {
              console.log(i);
              var check = $scope.add_inv_unadded[i];
              console.log(check);
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

          }).
          error(function(data, status, headers, config) {
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
    var isNum = (sort_str === 'par' || sort_str === 'stock');

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
      } else {
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

    $scope.inventory_items.sort($scope.sortFunc);
  };

})

.controller('modalParQuantityCtrl', function($scope, $modalInstance, $modal, MathService, item, is_seasonal) {

  $scope.item = item;

  $scope.new_failure_msg = null;

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
  $scope.end_date = {'date':null};
  $scope.dateControl = {};

  $scope.initDate = function() {
    /*
    var today = new Date();
    $scope.start_date = new Date(today.setDate(today.getDate()));
    $scope.start_date.setHours(0,0,0);

    $scope.end_date = new Date();
    $scope.end_date.setHours(23,59,59);
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

    if ($scope.is_seasonal) {

      var dates_valid = $scope.dateControl.validate();

      if (!dates_valid) {
        $scope.new_failure_msg = "Please enter valid Sales Period dates!";
        return;
      }

      console.log('date:');
      console.log($scope.start_date.date);

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