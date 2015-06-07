'use strict';

angular.module('myApp.viewInvByLoc', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewInvByLoc', {
      templateUrl: 'view_loc/view_loc.html',
      controller: 'ViewInvByLocCtrl',
      resolve: {
        locType: function() {
          // location type can be "bev" for beverage storage locations
          // or "kegs" for empty kegs storage locations
          return "bev";
        }
      }
    });
}])

.controller('ViewInvByLocCtrl', function($scope, $modal, $http, DateService, locType) {

  // XXX DO NOT REASSIGN VALUE OF k_loc_type, it is determined by route
  // to be "bev" or "keg" and is a CONSTANT
  $scope.k_loc_type = locType;

  $scope.add_loc = false;       // add new location mode
  $scope.edit_loc = false;      // edit location mode
  $scope.locations = [];        // all locations
  $scope.empty_locs = false;    // are locations empty?
  $scope.selected_loc = null;   // name of the selected location
  $scope.edit_loc_name = null;  
  $scope.last_update = null;    // last update text
  $scope.empty_inv = false;     // is location inventory empty?
  $scope.add_inv = false;       // add new inv item mode
  $scope.add_inv_all_items = [];  // a cache from server of all inv items
  $scope.add_inv_existing_items = [];  // all_items minus existing items in location
  $scope.total_inventory = 0;
  $scope.new_success_msg = null;
  $scope.inv_items = [];
  $scope.inv_started = false;
  $scope.update_failure_msg = "";

  // get locations, if empty, set $scope.empty_locs = true
  $http.get('/loc', {
      params: {
        type:$scope.k_loc_type
      }
  }).
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

      // Check the last_update field of storage locations and add a readable
      // field for when it was last updated, called "last_update_pretty"
      for (var loc_i in $scope.locations) {
        var loc = $scope.locations[loc_i];
        console.log(loc.last_update);
        var pretty_time = DateService.getPrettyTime(loc.last_update);
        $scope.locations[loc_i]['last_update_pretty'] = pretty_time;
      }

      // Add the + New button for creating new locations
      $scope.locations.push(
        {
          name: "+ New Location",
          is_add: true
        }
      );

      console.log($scope.locations);

      if ($scope.locations.length == 1)
      {
        // setting empty_locs will tell the UI to draw the first-time
        // add new location helper
        $scope.empty_locs = true;
      } else {
        // if there's only 1 location, automatically select it
        // XXX Disabled for now as I don't know if I like it... I like the user
        // having to manually select the location to know what they're doing.
        /*
        if ($scope.locations.length == 2) {
          $scope.selectLoc($scope.locations[0]);
        }
        */
      }
      
    }).
    error(function(data, status, headers, config) {

    });

  $scope.clearLocState = function() {
    $scope.add_inv = false;
    $scope.last_update = null;
    $scope.add_loc = false;       // add new location mode
    $scope.edit_loc = false;      // edit location mode
    $scope.empty_locs = false;    // are locations empty?
    if ($scope.locations.length == 1) {
      $scope.empty_locs = true;
    }
    $scope.new_success_msg = null;
    $scope.inv_started = false;
    $scope.update_failure_msg = "";
  };

  $scope.selectLoc = function(loc) {
    console.log(loc.name);

    if (loc.name == $scope.selected_loc)
    {
      return;
    }

    $scope.inv_started = false;

    // check if the location is the "+ New" button for creating a new location
    if (loc.is_add === true) {
      if ($scope.add_loc === true)
      {
        $scope.add_loc = false;
      } else {
        $scope.add_loc = true;
      }
      return;
    }

    $scope.selected_loc = loc.name;
    $scope.add_inv = false;
    $scope.getLocInv();
    $scope.last_update = loc.last_update_pretty;
    $scope.add_loc = false;       // add new location mode
    $scope.edit_loc = false;      // edit location mode
    $scope.empty_locs = false;    // are locations empty?
    $scope.new_success_msg = null;
    $scope.inv_started = false;
    $scope.update_failure_msg = "";
  };

  $scope.hideAddLoc = function() {
    $scope.add_loc=false;
  };

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
    $http.post('/loc', 
      {
        name:loc,
        type:$scope.k_loc_type
      }).
      success(function(data, status, headers, config) {
        // this callback will be called asynchronously when the response
        // is available
        console.log(data);
        // XXX if success, add returned item to $scope.inventory_items
        // otherwise, notify of failure and don't add
        // First, remove the "+ New" element at the end
        var add_new_loc = $scope.locations.splice(-1, 1);
        var new_loc_obj = {name:loc, last_update:null, last_update_pretty:null};
        $scope.locations.push(new_loc_obj);
        $scope.locations.push(add_new_loc[0]);
        $scope.empty_locs = false;
        $scope.new_loc = "";
        $scope.add_loc = false;
        $scope.selectLoc(new_loc_obj);
      }).
      error(function(data, status, headers, config) {
    });
  };

  $scope.toggleEditLoc = function() {
    if ($scope.edit_loc) {
      $scope.edit_loc = false;
    } else {
      $scope.edit_loc=true;
      $scope.edit_loc_name = $scope.selected_loc;
    }
  };

  // Shows the add new inventory item UI box
  $scope.showAddInv = function() {
    $scope.add_inv=true;
    $scope.new_success_msg = null;

    if ($scope.add_inv_all_items.length == 0)
    {
      $scope.getExistingInv();
    } else {
      $scope.cleanUpExistingInv();
    }
  };

  $scope.hideAddInv = function() {
    $scope.add_inv=false;
  };

  // item is an object here
  $scope.addExistingInv = function(item) {
    console.log ('add existing item: ' + item.product);

    $http.post('/inv/loc', {
      id:item.id, 
      location: $scope.selected_loc,
      type:$scope.k_loc_type}).
      success(function(data, status, headers, config) {
        console.log(data);
        // XXX push new item onto location's inventory items
        // XXX if new item not in all inventory, push into
        $scope.new_success_msg = item.product + " has been added to " + $scope.selected_loc + "!";
        item.quantity = 0;
        $scope.inv_items.push(item);
        //$scope.getLocInv();
        // XXX remove added item from $scope.add_inv_existing_items manually
        for ( var i=$scope.add_inv_existing_items.length-1; i >= 0; i--) {
          if ( $scope.add_inv_existing_items[i].id == item.id) {
            $scope.add_inv_existing_items.splice(i, 1);
          }
        }

        $scope.empty_inv = false;
      }).
      error(function(data, status, headers, config) {
    });
  };

  $scope.removeInvItem = function(index) {
    console.log(index);
    var item = $scope.inv_items[index];
    swal({
      title: "Remove Item?",
      text: "This will remove <b>" + item.product + "</b> from " + $scope.selected_loc + ".<br/><br/>It will not affect other locations which carry the item, or its entry in the Beverage DB.",
      type: "warning",
      html: true,
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $http.delete('/inv/loc', {
          params: {
            id:item.id,
            location:$scope.selected_loc,
            type:$scope.k_loc_type
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

  $scope.cleanUpExistingInv = function() {
    // On the client side, remove any entries in add_inv_existing_items
    // which are already in this location
    var clean_existing = [];
    for (var i=0; i < $scope.add_inv_all_items.length; i++) {
      var is_clean = true;
      var test_item = $scope.add_inv_all_items[i];
      for (var j=0; j < $scope.inv_items.length; j++) {
        var check_item = $scope.inv_items[j];
        if (test_item['version_id'] == check_item['version_id'])
        {
          is_clean = false;
          break;
        }
      }
      if (is_clean) {
        clean_existing.push(test_item);
      }
    }
    $scope.add_inv_existing_items = clean_existing;
  };

  $scope.getExistingInv = function() {
    var getParams = {name:$scope.selected_loc};
    // if this is empty kegs storage, filter on server for container_type "keg"
    if ($scope.k_loc_type === "kegs") {
      getParams["container_type"] = "Keg";
    }
    $http.get('/inv', {
      params: getParams
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
      $scope.cleanUpExistingInv();
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.promptStartInv = function() {

    // XXX If all quantities are 0, directly go to startInv starting from scratch
    // without prompting
    var total_qty = 0;
    for (var i in $scope.inv_items) {
      total_qty += $scope.inv_items[i]['quantity'];
    }
    if (total_qty <= 0) {
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
    $scope.inv_quantity_backup = {};
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      $scope.inv_quantity_backup[inv.id] = inv.quantity;

      if (from_scratch) {
        $scope.inv_items[inv_i]['quantity'] = 0; 
      }
    };
    console.log($scope.inv_quantity_backup);
  };

  $scope.saveInv = function() {

    var hasNaNs = false;
    // first check that all update quantities are valid numbers
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      if (isNaN(inv.quantity) || inv.quantity < 0) {
        $scope.inv_items[inv_i]['invalid_quantity'] = true;
        hasNaNs = true;
      }
      else {
        $scope.inv_items[inv_i]['invalid_quantity'] = false;
      }
    }
    if (hasNaNs) {
      $scope.update_failure_msg = "Please fix invalid quantities highlighted in red and try again!";
      return;
    }

    $scope.update_failure_msg = "";

    // inv_started shows the quantity adjustment UI
    $scope.inv_started = false;

    $scope.total_inventory = 0;
    var post_item_quantities = []
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      console.log(inv.product);
      console.log(inv.quantity);
      post_item_quantities.push({id:inv.id, quantity:parseFloat(inv.quantity)})
      $scope.inv_items[inv_i]['invalid_quantity'] = false;
      $scope.inv_items[inv_i]['add_q'] = null;

      var value = 0;
      // We locally calculate the new inventory without polling the server
      if ($scope.k_loc_type === "bev") {
        value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];
      }
      // always include deposits in value
      if (inv['deposit'] != null) {
        value += inv['deposit'] * inv['quantity'];
      }
      $scope.inv_items[inv_i]['inventory'] = value;
      $scope.inv_items[inv_i]['out_of_date'] = null;
      $scope.total_inventory += value;
    };

    $http.put('/inv/loc', {
      items:post_item_quantities,
      location:$scope.selected_loc,
      type:$scope.k_loc_type
    }).
    success(function(data, status, headers, config) {
      console.log(data);
      swal({
        title: "Inventory Saved!",
        text: "Well done, another inventory location down!",
        type: "success",
        timer: 3000,
        allowOutsideClick: true,
        html: true});
      // server redundantly returns total inventory, set it just in case
      $scope.total_inventory = data['total_inventory'];
      // for the selected location, set last_update locally to just now
      for (var i = 0; i < $scope.locations.length; i++) {
        var loc = $scope.locations[i];
        if (loc.name === $scope.selected_loc){
          $scope.locations[i].last_update = data['last_update'];
          var pretty_time = DateService.getPrettyTime(data['last_update']);
          $scope.locations[i]['last_update_pretty'] = pretty_time;
          $scope.last_update = pretty_time;
          break;
        }
      };

      // Call get loc inv to guarantee correct values for line items
      $scope.getLocInv()
    }).
    error(function(data, status, headers, config) {

    });
  }

  $scope.cancelInv = function() {
    $scope.inv_started = false;
    $scope.update_failure_msg = "";

    // restore backup quantities
    for (var inv_i in $scope.inv_items) {
      var inv = $scope.inv_items[inv_i];
      if (inv.id in $scope.inv_quantity_backup) {
        console.log('apply backup');
        console.log($scope.inv_items[inv_i].quantity);
        $scope.inv_items[inv_i].quantity = $scope.inv_quantity_backup[inv.id];
        $scope.inv_items[inv_i]['invalid_quantity'] = false;
        $scope.inv_items[inv_i]['add_q'] = null;
      }
    }
  }

  $scope.addQuantity = function(inv, num, isAddQ) {

    if (isNaN(num) || num === null) {
      if (isAddQ) {
        inv.add_q = null;
      }
      return;
    }

    var cur_quantity = parseFloat(inv.quantity);
    var add_num = parseFloat(num);

    inv.quantity = cur_quantity + add_num;

    if (inv.quantity < 0) {
      inv.quantity = 0;
    }

    if (isAddQ) {
      inv.add_q = null;
    }
  };

  $scope.saveLocName = function(new_name) {

    // First verify new name does not overlap with other locations
    for (var i = 0; i < $scope.locations.length; i++) {
      var loc = $scope.locations[i];
      if (new_name === loc.name) {
        swal({
          type: "warning",
          title:"Name Exists", 
          text: "There is already a location named " + new_name + ", please choose another name!"});
        return;
      }
    }

    $http.put('/loc', {
      name:$scope.selected_loc,
      type:$scope.k_loc_type,
      new_name:new_name
    }).
    success(function(data, status, headers, config) {
      // update the local location with the new name
      for (var i = 0; i < $scope.locations.length; i++) {
        var loc = $scope.locations[i];
        if (loc.name == $scope.selected_loc) {
          loc.name = new_name;
        }
      }
      $scope.selected_loc = new_name;
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.deleteLoc = function() {
    swal({
      title: "Delete this Location?",
      text: "This will remove " + $scope.selected_loc + " and all its inventory data, and cannot be undone.",
      type: "warning",
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $http.delete('/loc', {
          params: {
          location:$scope.selected_loc,
          type:$scope.k_loc_type
        }
      }).
      success(function(data, status, headers, config) {
        for (var i = $scope.locations.length-1; i >= 0; i--) {
          var loc = $scope.locations[i];
          if (loc.name === $scope.selected_loc) {
            $scope.locations.splice(i, 1);
          }
        }
        $scope.selected_loc = null;
        $scope.clearLocState();
      }).
      error(function(data, status, headers, config) {

      });
    });
  };

  $scope.getLocInv = function() {
    $http.get('/inv/loc', {
      params: {
        name:$scope.selected_loc,
        type:$scope.k_loc_type
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

      // add a custom 'invalid_quantity' key for quantity update UI so we can 
      // display red input boxes if quantity is not a number
      for (var i = 0; i < $scope.inv_items.length; i++)
      {
        $scope.inv_items[i]['invalid_quantity'] = false;
        $scope.inv_items[i]['add_q'] = null;
      }

      // calculate total inventory
      $scope.total_inventory = 0;
      for (var inv_i = 0; inv_i < $scope.inv_items.length; inv_i++)
      {
        var inv = $scope.inv_items[inv_i];

        var value = 0;
        // server has been updated to return inventory value
        if (inv['inventory'] !== null) {
          value = inv['inventory'];
        } else {
          // for old entries which might lack inventory value, do some potentially
          // inaccurate calculations here
          if ($scope.k_loc_type === "bev") {
            value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];
          }
          // always include deposits in value
          if (inv['deposit'] != null) {
            value += inv['deposit'] * inv['quantity'];
          }
        }
        $scope.inv_items[inv_i]['inventory'] = value;
        $scope.total_inventory += value;
      }

      // check update in each inventory item and if updated within 24
      // hours, add key "updated_today": true
      for (var i = 0; i < $scope.inv_items.length; i++)
      {
        var update_str = $scope.inv_items[i]["update"];

        // e.g., 2015-03-16
        var date_str = update_str.substring(0,update_str.indexOf('T'));
        // e.g., 07:43:49
        var time_str = update_str.substring(
          update_str.indexOf('T')+1,
          update_str.indexOf('.'));
        var date_comps = date_str.split('-');
        var time_comps = time_str.split(':');
        var update = Date.UTC(
          date_comps[0], parseInt(date_comps[1])-1, date_comps[2],
          time_comps[0], time_comps[1], time_comps[2]);
        var dt_sec = (Date.now() - update) / 1000.0
        var dt_hour = dt_sec / 60.0 / 60.0
        if (dt_hour < 24)
        {
          $scope.inv_items[i]["updated_today"] = true;
        }
        console.log("last updated " + dt_hour + " hours ago");
        
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
})


.controller('startCountModalCtrl', function($scope, $modalInstance) {

  $scope.show_help = false;

  $scope.showHelp = function() {
    $scope.show_help = true;
  }

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

  $scope.pickMode = function(mode) {

    // mode should be 'scratch' or 'edit'
    $modalInstance.close(mode);
  };

});