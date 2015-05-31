'use strict';

angular.module('myApp.viewOnTap', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewOnTap', {
    templateUrl: 'view_tap/view_tap.html',
    controller: 'ViewOnTapCtrl'
  });
}])

.controller('ViewOnTapCtrl', function($scope, $modal, $http, DateService) {

  $scope.k_loc_type = 'tap';
  $scope.use_modes = ['Track Taps', 'Take Inventory'];
  $scope.use_mode = 0;

  $scope.empty_taps = true;
  $scope.inv_started = false;
  $scope.total_inventory = 0;
  $scope.last_update = null;
  $scope.update_failure_msg = "";

  $scope.taps = [];
  $scope.num_tapped = 0;

  $scope.selectUseMode = function(use_mode) {
    if (use_mode === $scope.use_modes[0]) {
      $scope.use_mode = 0;
      $scope.inv_started = false;
    } else {
      $scope.use_mode = 1;
      $scope.getTapInv();
    }
  };

  // get locations, if empty, set $scope.empty_locs = true
  $http.get('/taps').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data == null)
      {
        $scope.taps = [];
      }
      else
      {
        $scope.taps = data;
      }
      
      for (var tap_i in $scope.taps) {
        var tap = $scope.taps[tap_i];
        if (tap['name'] === null) {
          // give taps a default name, which is 'Tap #'
          tap['display_name'] = 'Tap #' + (parseInt(tap_i)+1).toString();
        } else {
          tap['display_name'] = tap['name'];
        }
        tap['beverage'] = null;
        tap['tap_time'] = null;
        tap['display_time'] = 'Last tapped: --'
        tap['is_tapped'] = false;
        tap['inv_volume'] = null;
        tap['inv_unit'] = null;
        tap['invalid_volume'] = false;
      }

      $scope.getTapBevs(null);
    }).
    error(function(data, status, headers, config) {

    });

  // get the tap / untap history of beverages for each tap
  // if tap_id is specified (not null), just get that single id
  // otherwise get all tap ids
  $scope.getTapBevs = function(tap_id) {

    $scope.num_tapped = 0;

    var all_tap_ids = [];
    if (tap_id !== null) {
      all_tap_ids = [tap_id];
    } else {
      for (var tap_i in $scope.taps) {
        all_tap_ids.push($scope.taps[tap_i].id);
      };
    }

    $http.get('/taps/bevs', {
      params: {
        ids: all_tap_ids
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      for (var tap_i in data) {
        var tap_bev = data[tap_i];
        for (var tap_j in $scope.taps) {
          var tap = $scope.taps[tap_j];
          if (tap.id === tap_bev.tap_id) {
            $scope.taps[tap_j]['beverage_id'] = tap_bev['beverage_id'];
            var is_tapped = tap_bev['tap_or_untap'] === "tap";
            $scope.taps[tap_j]['is_tapped'] = is_tapped;
            $scope.taps[tap_j]['tap_time'] = tap_bev['tap_time'];
            if (is_tapped) {
              $scope.num_tapped += 1;
              $scope.taps[tap_j]['beverage'] = tap_bev['product'];
              $scope.taps[tap_j]['inv_unit'] = tap_bev['purchase_unit'];
              $scope.taps[tap_j]['purchase_volume'] = tap_bev['purchase_volume'];
              $scope.taps[tap_j]['display_time'] = "Tapped: " + $scope.getDisplayTime(tap_bev['tap_time'], null);
            } else {
              $scope.taps[tap_j]['beverage'] = null;
              $scope.taps[tap_j]['inv_unit'] = null;
              $scope.taps[tap_j]['purchase_volume'] = null;
              $scope.taps[tap_j]['display_time'] = "Untapped: " + $scope.getDisplayTime(tap_bev['tap_time'], null);
            }
            
            break;
          }
        }
      }
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.getTapInv = function() {
    $http.get('/inv/taps').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);

      if (data === null) {
        return;
      }

      var tap_invs = data['taps_inventory'];
      $scope.last_update = null;
      $scope.total_inventory = data['total_inventory'];

      var pretty_time = DateService.getPrettyTime(data['last_update']);
      $scope.last_update = pretty_time;

      for (var tap_i in tap_invs) {
        var tap = tap_invs[tap_i];
        var tap_id = tap['location_id']; // tap id is returned as location_id
        // since behind the scenes taps are locations
        for (var tap_j in $scope.taps) {
          var existing_tap = $scope.taps[tap_j];
          if (existing_tap.id === tap_id) {
            if (!existing_tap['is_tapped']) {
              break;
            }
            $scope.taps[tap_j]['inv_volume'] = tap['quantity'];
            $scope.taps[tap_j]['inv_unit'] = tap['purchase_unit'];
            break;
          }
        }
      }

    }).
    error(function(data, status, headers, config) {

    });
  };

  

  $scope.saveInv = function() {

    // first clear any invalid errors
    for (var tap_i in $scope.taps) {
      $scope.taps[tap_i]['invalid_volume'] = false;
    }
    $scope.update_failure_msg = "";

    var has_invalid = false;

    // first check all inv volumes are valid floats
    for (var tap_i in $scope.taps) {
      var tap = $scope.taps[tap_i];
      if (isNaN(tap['inv_volume']) || tap['inv_volume'] < 0) {
        $scope.taps[tap_i]['invalid_volume'] = true;
        has_invalid = true;
      }
    }

    if (has_invalid) {
      $scope.update_failure_msg = "Please fix invalid quantities highlighted in red and try again!";
      return;
    }

    // Post this data structure:
    // [{id:X, location_id:X, quantity:X}]
    // one object for each tap
    //var test_post = [{id:1, location_id:1, quantity:1}, {id:2, location_id:2, quantity:2}];
    var post_tap_vols = [];

    for (var tap_i in $scope.taps) {
      var tap = $scope.taps[tap_i];
      if (tap.is_tapped) {
        var tap_vol = {id:tap['beverage_id'], location_id:tap['id'], quantity:parseFloat(tap['inv_volume'])};
        post_tap_vols.push(tap_vol);
      }
    }

    $scope.inv_started = false;

    $http.post('/inv/taps', 
      {
        items:post_tap_vols
      }).
      success(function(data, status, headers, config) {
        // this callback will be called asynchronously when the response
        // is available
        console.log(data);
        swal({
        title: "Inventory Saved!",
        text: "Give yourself a pat on the back, because you just finished on-tap inventory!",
        type: "success",
        timer: 4000,
        allowOutsideClick: true,
        html: true});

        $scope.last_update=DateService.getPrettyTime(data['last_update']);
        $scope.total_inventory=data['total_inventory'];

      }).
      error(function(data, status, headers, config) {
    });
  };

  $scope.getDisplayTime = function(timestamp, or_date) {
    var date;
    if (or_date === null) {
      date = DateService.getDateFromUTCTimeStamp(timestamp, true);
    } else {
      date = or_date;
    }

    var year = date.getFullYear();
    var month = date.getMonth();
    var day = date.getDate();
    
    var dtime = (month+1).toString() + "/" + day + "/" + year;

    var time_str = date.toLocaleTimeString().replace(/([\d]+:[\d]{2})(:[\d]{2})(.*)/, "$1$3");

    dtime += " " + time_str;

    return dtime
  }

  // Gets all inventory which are kegs, for e.g., listing all beer types
  // when tapping a tap
  $scope.getExistingInv = function() {

    // if this is empty kegs storage, filter on server for container_type "keg"
    $http.get('/inv', {
      params: {
        container_type: "Keg"
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.add_inv_all_items = data;
      }
      else {
        $scope.add_inv_all_items = [];
      }
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getExistingInv();

  $scope.addNewTap = function() {

    $http.post('/taps', {
      name:null
    }).
      success(function(data, status, headers, config) {
        console.log(data);

        var tap_num = $scope.taps.length + 1;
        var tap_name = "Tap #" + tap_num.toString();
        $scope.taps.push(
        {
          id:data['id'],
          name: tap_name,
          display_name: tap_name,
          beverage: null,
          tap_time: null,
          display_time: 'Last tapped: --',
          is_tapped: false,
          inv_volume: null,
          inv_unit: null
        });

      }).
      error(function(data, status, headers, config) {
    });
  };

  $scope.removeTap = function(index) {
    var tap = $scope.taps[index];
    swal({
      title: "Remove Tap?",
      text: "This will remove <b>" + tap.display_name + "</b> from your tracked taps.",
      type: "warning",
      html: true,
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: false },
      function() {
        // we call the /taps api instead of /loc api because deleting depends
        // on other tap-specific tables, such as tap_beverages
        $http.delete('/taps', {
          params: {
            id:tap.id
          }
        }).
        success(function(data, status, headers, config) {
          swal({
            title: "Tap Removed!",
            text: "<b>"+tap.display_name + "</b> has been removed.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
          $scope.taps.splice(index, 1);
          // fix temp tap names
          for (var tap_i in $scope.taps) {
            if ($scope.taps[tap_i]['name'] === null) {
              $scope.taps[tap_i]['display_name'] = 'Tap #' + (parseInt(tap_i)+1).toString();
            }
          }          
        }).
        error(function(data, status, headers, config) {

        });
      });
  };

  $scope.doTap = function(tap, tap_or_untap) {
    var modalStartInstance = $modal.open({
      templateUrl: 'showTapModal.html',
      controller: 'showTapModalCtrl',
      windowClass: 'start-count-modal',
      backdropClass: 'start-count-modal-backdrop',
      size: 'md',
      resolve: {
        tap: function() {
          return tap;
        },
        add_inv_all_items: function() {
          return $scope.add_inv_all_items;
        },
        tap_or_untap: function() {
          return tap_or_untap;
        }
      }
    });

    modalStartInstance.result.then(
      // success status.  
      // result[0] is beverage product name, result[1] is tap time
      function( result ) {
        if (tap_or_untap === 'tap') {
          tap['is_tapped'] = true;
          tap['beverage'] = result[0]; 
          tap['tap_time'] = result[1];
          tap['display_time'] = "Tapped: " + $scope.getDisplayTime(null, result[1]);
          $scope.num_tapped += 1;
        } else {
          tap['is_tapped'] = false;
          tap['beverage'] = null; 
          tap['tap_time'] = result[1];
          tap['display_time'] = "Untapped: " + $scope.getDisplayTime(null, result[1]);
          $scope.num_tapped -= 1;
        }

        $scope.getTapBevs(tap.id);
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.promptStartInv = function() {

    // XXX If all quantities are 0, directly go to startInv starting from scratch
    // without prompting
    var total_vol = 0;
    for (var i in $scope.taps) {
      total_vol += $scope.taps[i]['inv_volume'];
    }
    if (total_vol <= 0) {
      $scope.startInv(true);
      return;
    }

    var modalStartInstance = $modal.open({
      templateUrl: 'startCountModal.html',
      controller: 'startCountModalCtrl',
      windowClass: 'start-count-modal',
      backdropClass: 'start-count-modal-backdrop',
      size: 'md',
      resolve: {
        
      }
    });

    modalStartInstance.result.then(
      // success status
      function( mode ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is beverage id
        if (mode === 'scratch') {
          $scope.startInv(true);
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (mode === 'previous') {
          $scope.startInv(false);
        }
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.startInv = function(from_scratch) {
    $scope.inv_started = true;

    // Create a backup of all quantities of inventory items with object
    // with keys of item id and values of id quantity.  If user cancels
    // inventory without saving, restore this
    $scope.inv_volume_backup = {};
    for (var tap_i in $scope.taps) {
      var tap = $scope.taps[tap_i];
      $scope.inv_volume_backup[tap.id] = tap.inv_volume;

      if (from_scratch) {
        $scope.taps[tap_i]['inv_volume'] = 0; 
      }
    };
    console.log($scope.inv_volume_backup);
  };

  $scope.cancelInv = function() {
    $scope.inv_started = false;
    $scope.update_failure_msg = "";

    // restore backup quantities
    for (var tap_i in $scope.taps) {
      var tap = $scope.taps[tap_i];
      if (tap.id in $scope.inv_volume_backup) {
        console.log('apply backup');
        $scope.taps[tap_i].inv_volume = $scope.inv_volume_backup[tap.id];
        $scope.taps[tap_i]['invalid_volume'] = false;
      }
    }
  }

})

.controller('showTapModalCtrl', function($scope, $modalInstance, $http, tap, add_inv_all_items, tap_or_untap) {

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

  $scope.tap = tap;
  $scope.add_inv_all_items = add_inv_all_items;
  $scope.tap_or_untap = tap_or_untap;
  $scope.selected_bev = null;
  $scope.form_error_msg = null;

  $scope.clearFormVer = function() {

    // form verification
    $scope.form_ver = {};
    $scope.form_ver.error_beverage = false;
    $scope.form_ver.error_date = false;

    $scope.form_error_msg = null;
  };

  $scope.clearFormVer();

  $scope.selectBev = function(bev) {
    console.log(bev);
    $scope.selected_bev = bev;
    console.log($scope.selected_bev);

    $scope.form_ver.error_beverage = false;
  };

  $scope.selectBevName = function(bevname) {
    console.log(bevname);
    for (var i in $scope.add_inv_all_items) {
      if ($scope.add_inv_all_items[i]['product'] === bevname) {
        $scope.selected_bev = $scope.add_inv_all_items[i];
        $scope.form_ver.error_beverage = false;
        break;
      }
    }
    $scope.find_bev = null;
  };

  $scope.updateTap = function(tap_or_untap) {

    $scope.clearFormVer();
    var has_errors = false;

    // verify form
    if (tap_or_untap==='tap' && $scope.selected_bev === null) {
      $scope.form_ver.error_beverage = true;
      has_errors = true;
    }

    // First convert the local time to UTC time
    var year, month, day, hour, minute;
    var date_obj;   // time obj for date

    if (typeof $scope.dt === 'string')
    {
      date_obj = $scope.today;
    } else if (typeof $scope.dt === 'object') {
      date_obj = $scope.dt;
    }

    if (date_obj === undefined || typeof date_obj !== 'object') {
      $scope.form_ver.error_date = true;
      has_errors = true;
    }

    if (has_errors) {
      $scope.form_error_msg = "Whoops!  Please fix any errors and try again!";
      return;
    }
    
    year = date_obj.getFullYear();
    month = date_obj.getMonth();
    day = date_obj.getDate();
    hour = $scope.mytime.getHours();
    minute = $scope.mytime.getMinutes();

    // pass the local date, server will know to handle into UTC time
    var local_date = new Date(year, month, day, hour, minute, 0);

    var bev_id, bev_product;
    if (tap_or_untap==='tap') {
      bev_id = $scope.selected_bev.id;
      bev_product = $scope.selected_bev.product;
    } else {
      bev_id = $scope.tap.beverage_id;
      bev_product = $scope.tap.beverage;
    }

    // save to DB the tap id, bev id, the user entered tap time, tap='tap'
    $http.post('/taps/bevs', {
      beverage_id:bev_id, 
      tap_id: $scope.tap.id,
      tap_or_untap: tap_or_untap,
      tap_time: local_date
    }).
      success(function(data, status, headers, config) {
        $modalInstance.close([bev_product, local_date]);
      }).
      error(function(data, status, headers, config) {
    });

  };


  //=====================================
  // Date picker
  $scope.minDate = null;
  $scope.dt = null

  $scope.selected_bev = null;

  $scope.formats = ['EEE MMMM dd yyyy', 'yyyy/MM/dd', 'dd.MM.yyyy', 'shortDate'];
  $scope.format = $scope.formats[0];

  $scope.today = function() {
    var today = new Date();
    $scope.dt = today.toDateString();
    $scope.today = today;
  };
  $scope.today();

  $scope.clear = function () {
    $scope.dt = null;
  };

  $scope.toggleMin = function() {
    //$scope.minDate = $scope.minDate ? null : new Date();
  };
  //$scope.toggleMin();

  $scope.openDate = function($event) {
    $event.preventDefault();
    $event.stopPropagation();

    $scope.opened = true;
  };

  $scope.dateOptions = {
    formatYear: 'yy',
    startingDay: 1
  };

  $scope.getDayClass = function(date, mode) {
    if (mode === 'day') {
      var dayToCheck = new Date(date).setHours(0,0,0,0);

      for (var i=0;i<$scope.events.length;i++){
        var currentDay = new Date($scope.events[i].date).setHours(0,0,0,0);

        if (dayToCheck === currentDay) {
          return $scope.events[i].status;
        }
      }
    }

    return '';
  };

  //=====================================
  // Time picker
  $scope.mytime = new Date();
  $scope.mytime.setMinutes(
    parseInt($scope.mytime.getMinutes() / 5) * 5);

  $scope.hstep = 1;
  $scope.mstep = 5;

  $scope.ismeridian = true;
  $scope.toggleMode = function() {
    $scope.ismeridian = ! $scope.ismeridian;
  };

  $scope.update = function() {
    var d = new Date();
    d.setHours( 14 );
    d.setMinutes( 0 );
    $scope.mytime = d;
  };

  $scope.changed = function () {
  };

  $scope.clear = function() {
    $scope.mytime = null;
  };

});













