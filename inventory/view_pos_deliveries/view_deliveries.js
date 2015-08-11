'use strict';

angular.module('myApp.viewDeliveries', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewDeliveries', {
      templateUrl: 'view_pos_deliveries/view_deliveries.html',
      controller: 'ViewDeliveriesCtrl'
    });
}])

.controller('ViewDeliveriesCtrl', function($scope, $modal, $http, DateService, MathService, DistributorsService) {

  $scope.show_add_ui = true;
  $scope.addInvControl = {};
  $scope.addInvLocName = "this Delivery."; // a string for add inv UI to display e.g., "XX has been added to this Delivery."
  $scope.add_inv_all_bevs = [];       // a cache from server of all inv items
  $scope.add_inv_unadded_bevs = [];  // all_items minus existing items in location
  $scope.add_inv_added_bevs = [];

  $scope.delivery_date = null;
  $scope.delivery_time = null;

  $scope.distributors = null;
  $scope.new_distributor = null;

  $scope.show_add_bev_ui = false;

  // get all inventory from the server.  If location type is bev, get /inv
  // items.  If location type is kegs, get /kegs.
  $scope.getAllInv = function() {

    $http.get('/inv').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.add_inv_all_bevs = data;
        for (var i in $scope.add_inv_all_bevs) {
          $scope.add_inv_all_bevs[i]['type'] = 'bev';
        }
      }
      else {
        $scope.add_inv_all_bevs = [];
      }
      $scope.cleanUpExistingInv();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.cleanUpExistingInv = function() {
    // On the client side, remove any entries in add_inv_unadded_bevs
    // which are already in this location
    var clean_bevs = [];
    for (var i=0; i < $scope.add_inv_all_bevs.length; i++) {

      var is_clean = true;
      var test_item = $scope.add_inv_all_bevs[i];
      for (var j=0; j < $scope.add_inv_added_bevs.length; j++) {
        var check_item = $scope.add_inv_added_bevs[j];
        if (check_item['type'] === "keg") {
          continue;
        }
        if (test_item['version_id'] == check_item['version_id'])
        {
          is_clean = false;
          break;
        }
      }
      if (is_clean) {
        clean_bevs.push(test_item);
      }
    }
    $scope.add_inv_unadded_bevs = clean_bevs;
  };

  $scope.addInvAddBev = function(bev) {

    $scope.add_inv_added_bevs.push(bev);

    // XXX remove added item from $scope.add_inv_unadded_bevs manually
    for ( var i=$scope.add_inv_unadded_bevs.length-1; i >= 0; i--) {
      if ( $scope.add_inv_unadded_bevs[i].id === bev.id) {
        $scope.add_inv_unadded_bevs.splice(i, 1);
        break;
      }
    }
  };

  $scope.getDistributors = function() {
    var result = DistributorsService.get();
    result.then(
      function(payload) {
        var data = payload.data;
        console.log(data);
        $scope.distributors = data;
        if ($scope.distributors===null || $scope.distributors.length === 0) {
          $scope.distributors = [];
        } else {
          for (var i in $scope.distributors) {
            if ($scope.distributors[i].kegs === null) {
              $scope.distributors[i].kegs = [];
            }
          }
        }
      },
      function(errorPayload) {
        ; // do nothing for now
      });
  };

  // Shows the add new inventory item UI box
  $scope.showAddInv = function() {
    $scope.show_add_ui=true;
    //$scope.addInvControl.clearState();

    if ($scope.add_inv_all_bevs.length == 0)
    {
      $scope.getAllInv();
    }

    if ($scope.distributors === null) {
      $scope.getDistributors();
    }
  };
  $scope.showAddInv();

  $scope.showAddBevInv = function() {
    $scope.show_add_bev_ui = true;
  };

  $scope.hideAddBevInv = function() {
    $scope.show_add_bev_ui = false;
  }



  //=====================================
  // Date picker
  $scope.minDate = null;
  $scope.dt = null;

  $scope.selected_bev = null;

  $scope.formats = ['EEE MMMM dd yyyy', 'yyyy/MM/dd', 'dd.MM.yyyy', 'shortDate'];
  $scope.format = $scope.formats[0];

  $scope.today = function() {
    var today = new Date();
    $scope.dt = new Date();
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

    $scope.opened = !$scope.opened;
  };

  $scope.dateOptions = {
    formatYear: 'yy',
    startingDay: 1,
    showWeeks:false
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