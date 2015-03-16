'use strict';

angular.module('myApp.viewInvByLoc', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewInvByLoc', {
    templateUrl: 'view_loc/view_loc.html',
    controller: 'ViewInvByLocCtrl'
  });
}])

.controller('ViewInvByLocCtrl', function($scope, $http) {

  $scope.empty_locs = false;    // are locations empty?
  $scope.selected_loc = null;   // name of the selected location
  $scope.empty_inv = false;      // is location inventory empty?
  $scope.add_inv = false;       // add new inv item mode
  $scope.new_inv_msg = "";      // dialog box for adding inventory status
  $scope.inv_items = [];

  // get locations, if empty, set $scope.empty_locs = true
  $http.get('/loc').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data == null)
      {
        $scope.locations = [];
      }
      else
      {
        $scope.locations = data;
      }

      if ($scope.locations.length == 0)
      {
        // setting empty_locs will tell the UI to draw the first-time
        // add new location helper
        $scope.empty_locs = true;
      }
    }).
    error(function(data, status, headers, config) {

    });

  $scope.selectLoc = function(loc) {
    console.log(loc.name);
    $scope.selected_loc = loc.name;
    $scope.add_inv = false;
    $scope.getLocInv();
  }

  $scope.addNewLoc = function(loc) {
    console.log('add loc: ' + loc);
    // check if it's empty
    if (loc == undefined || loc == '')
    {
      swal({
        title:"Empty Name", 
        text: "Please enter a location name!",
        timer: 1500});
      return;
    }
    // check if location is already in $scope.locations
    for (var loc_i in $scope.locations) {
      console.log(loc_i);
      var existing = $scope.locations[loc_i];
      if (existing.name == loc)
      {
        console.log(loc + ' is already in system!');
        // XXX Change this to red text on page instead of alert
        swal({
        title:"Location Exists", 
        text: loc + " is already in the system!!"});
        $scope.new_loc = "";
        return;
      }
    }
    $http.post('/loc', {name:loc}).
      success(function(data, status, headers, config) {
        // this callback will be called asynchronously when the response
        // is available
        console.log(data);
        // XXX if success, add returned item to $scope.inventory_items
        // otherwise, notify of failure and don't add
        $scope.locations.push({name:loc});
        $scope.empty_locs = false;
        $scope.new_loc = "";
      }).
      error(function(data, status, headers, config) {
    });
  };

  // Shows the add new inventory item UI box
  $scope.showAddInv = function() {
    $scope.add_inv=true;
    $scope.new_inv_msg = "";
  };

  $scope.hideAddInv = function() {
    $scope.add_inv=false;
  };

  $scope.addNewInv = function(item) {
    console.log ('add item: ' + item);
    // check if empty
    if (item == undefined || item =='')
    {
      swal({
        title:"Empty Name", 
        text: "Please enter an item name!",
        timer: 1500});
      return;
    }
    // XXX check if item already in all inventory items
    // NEED TO IMPLEMENT THIS
    $http.post('/inv/loc', {
      name:item, 
      unit:"unit",
      location: $scope.selected_loc,
      quantity: 1,
      unit_price: 0}).
      success(function(data, status, headers, config) {
        console.log(data);
        // XXX push new item onto location's inventory items
        // XXX if new item not in all inventory, push into
        $scope.new_inv = "";
        $scope.new_inv_msg = item + " was added to " + $scope.selected_loc;
        $scope.getLocInv();
      }).
      error(function(data, status, headers, config) {
    });
  };

  $scope.updateInvItem = function(index) {
    console.log(index);
    var item = $scope.inv_items[index];
    $http.put('/inv/loc', {
      name:item.name,
      unit:item.unit,
      location:$scope.selected_loc,
      quantity:item.quantity,
      unit_price:item.unit_price
    });
  };

  $scope.removeInvItem = function(index) {
    console.log(index);
    var item = $scope.inv_items[index];
    swal({
      title: "Remove Item",
      text: "This will remove " + item.name + " from " + $scope.selected_loc + ".  Are you sure?",
      type: "warning",
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $http.delete('/inv/loc', {
          params: {
            name:item.name,
            unit:item.unit,
            location:$scope.selected_loc
          }
        }).
        success(function(data, status, headers, config) {
          $scope.getLocInv();
          swal("Removed!", item.name + " has been removed.", "success");
        }).
        error(function(data, status, headers, config) {

        });
      });
    
  };

  $scope.getLocInv = function() {
    $http.get('/inv/loc', {
      params: {
        name:$scope.selected_loc
      }
    }).
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.inv_items = data;
      }
      else {
        $scope.inv_items = [];
      }

      // check last_update in each inventory item and if updated within 24
      // hours, add key "updated_today": true
      for (var i = 0; i < $scope.inv_items.length; i++)
      {
        $scope.inv_items[i]["updated_today"] = true;
      }

      if ($scope.inv_items.length == 0) {
        $scope.empty_inv = true;
      } else {
        $scope.empty_inv = false;
      }
      console.log($scope.empty_inv);
    }).
    error(function(data, status, headers, config) {

    });
  };

});