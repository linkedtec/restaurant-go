'use strict';

angular.module('myApp.viewInvByLocNew', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
    when('/viewInvByLocNew', {
      templateUrl: 'view_loc/view_loc_new.html',
      controller: 'ViewInvByLocNewCtrl',
      resolve: {
        locType: function() {
          // location type can be "bev" for beverage storage locations
          // or "kegs" for empty kegs storage locations
          return "bev";
        }
      }
    });
}])

.controller('ViewInvByLocNewCtrl', function($scope, $modal, $http, DateService, MathService, locType) {

  // XXX DO NOT REASSIGN VALUE OF k_loc_type, it is determined by route
  // to be "bev" or "keg" and is a CONSTANT
  $scope.k_loc_type = locType;

  $scope.show_add_loc_ui = false;  // add new location mode
  $scope.newLocControl = {};
  $scope.edit_loc = false;      // edit location mode
  $scope.editLocControl = {};

  $scope.addInvControl = {};

  $scope.locations = [];        // all locations
  $scope.selected_loc = null;   // selected location
  $scope.last_update = null;    // last update text
  $scope.show_add_ui = false;       // add new inv item mode
  $scope.add_inv_all_bevs = [];  // a cache from server of all inv items
  $scope.add_inv_existing_bevs = [];  // all_items minus existing items in location
  $scope.all_kegs = [];
  $scope.add_inv_existing_kegs = [];
  $scope.total_inventory = 0;
  $scope.inv_items = [];
  $scope.inv_started = false;
  $scope.update_failure_msg = "";

  // querying / filtering
  $scope.add_inv_query = {query:""};

  // sorting
  $scope.sort_key = null;
  $scope.double_sort = -1;
  $scope.firstTimeSort = true;

  // ===========================================================================
  // Locations, these are shared functionality between bev and keg views
  // ===========================================================================
  // get locations
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

      console.log($scope.locations);
      
    }).
    error(function(data, status, headers, config) {

    });

  // Shows the add new location UI box
  $scope.showAddLocation = function() {
    $scope.show_add_loc_ui=true;
  };

  $scope.hideAddLoc = function() {
    $scope.show_add_loc_ui=false;
    $scope.newLocControl.clearNewForm();
  };

  $scope.newLocationCloseOnSave = function(new_loc) {
    // new_loc is the name of the new location
    var new_loc_obj = {name:new_loc, last_update:null, last_update_pretty:null};
    $scope.locations.push(new_loc_obj);
    $scope.selectLoc(new_loc_obj);
    $scope.show_add_loc_ui = false;
  };

  $scope.editLocationCloseOnDelete = function(delete_loc) {
    for (var i = $scope.locations.length-1; i >= 0; i--) {
      var loc = $scope.locations[i];
      if (loc.name === $scope.selected_loc.name) {
        $scope.locations.splice(i, 1);
      }
    }
    $scope.selected_loc = null;
    $scope.clearLocState();
  };

  $scope.toggleEditLoc = function() {
    if ($scope.edit_loc) {
      $scope.edit_loc = false;
      $scope.editLocControl.clearForm();
    } else {
      $scope.edit_loc=true;
    }
  };


  // ===========================================================================
  // Inventory-related, these differ for 'bev' or 'kegs' k_loc_type
  // ===========================================================================
  $scope.clearLocState = function() {
    $scope.show_add_ui = false;
    $scope.last_update = null;
    $scope.show_add_loc_ui = false;   // add new location mode
    $scope.edit_loc = false;      // edit location mode
    $scope.addInvControl.clearState();
    $scope.inv_started = false;
    $scope.update_failure_msg = "";
  };

  $scope.selectLoc = function(loc) {
    console.log(loc.name);

    if ( $scope.selected_loc!==null && (loc.name === $scope.selected_loc.name))
    {
      return;
    }

    $scope.inv_started = false;

    $scope.selected_loc = loc;
    $scope.show_add_ui = false;
    $scope.getLocInv();
    $scope.last_update = loc.last_update_pretty;
    $scope.show_add_loc_ui = false;   // add new location mode
    $scope.edit_loc = false;      // edit location mode
    $scope.addInvControl.clearState();
    $scope.inv_started = false;
    $scope.update_failure_msg = "";
  };

  // Shows the add new inventory item UI box
  $scope.showAddInv = function() {
    $scope.show_add_ui=true;
    $scope.addInvControl.clearState();

    if ($scope.add_inv_all_bevs.length == 0)
    {
      $scope.getAllInv();
    } else {
      $scope.cleanUpExistingInv();
    }
  };

  $scope.hideAddInv = function() {
    $scope.show_add_ui=false;
  };

  $scope.getBevIcon = function(item) {

    if (item.type==='keg') {
      return 'keg';
    }

    if (item.alcohol_type==='Beer' || item.alcohol_type==='Cider') {
      if (item.container_type==='Keg') {
        return 'draft';
      } else if (item.container_type==='Bottle') {
        return 'bottle';
      } else {
        return 'can'
      }
    } else if (item.alcohol_type==='Wine') {
      return 'wine';
    } else if (item.alcohol_type==='Liquor') {
      return 'liquor';
    } else {
      if (item.container_type==='Can') {
        return 'can'
      } else if (item.container_type==='Bottle') {
        return 'bottle'
      } else {
        return null; // XXX Default generic icon?
      }
    }
    return null;
  };

  $scope.getDisplayName = function(item) {
    if (item.type==='bev') {
      return item.product;
    } else if (item.type==='keg') {
      var volume = item['volume'];
      if (volume===undefined) {
        volume = item['purchase_volume'];
      }
      var unit = item['unit'];
      if (unit===undefined) {
        unit = item['purchase_unit'];
      }
      return item['distributor'] + ' ' + volume + ' ' + unit + ' Empty Keg';
    }
    return item.product;
  };

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
          var item = $scope.add_inv_all_bevs[i];
          item['inventory'] = 0;
          item['quantity'] = 0;
          item['type'] = 'bev';

          item['volume'] = MathService.fixFloat1(item['volume']);
          item['purchase_cost'] = MathService.fixFloat1(item['purchase_cost']);
          item['deposit'] = MathService.fixFloat1(item['deposit']);

          item['display_name'] = $scope.getDisplayName(item);

          // get the icon type
          // draft beer (beer mug)
          // wine (wine bottle)
          // bottle (either beer or non-alc)
          // can (either beer or non-alc)
          // liquor (XO bottle)
          item['icon'] = $scope.getBevIcon(item);
        }
      }
      else {
        $scope.add_inv_all_bevs = [];
      }

      // now that we got beverage inventory, get the empty kegs as well
      $scope.getAllKegs();

      
    }).
    error(function(data, status, headers, config) {

    });
  };
  $scope.getAllInv();

  $scope.getAllKegs = function() {
    $http.get('/kegs').
    success(function(data, status, headers, config) {
      // this callback will be called asynchronously when the response
      // is available
      console.log(data);
      if (data != null) {
        $scope.all_kegs = data;
        for (var i in $scope.all_kegs) {
          var keg = $scope.all_kegs[i];
          keg['inventory'] = 0;
          keg['quantity'] = 0;
          keg['type'] = 'keg';
          // fix floating point
          keg['volume'] = MathService.fixFloat1(keg['volume']);
          keg['purchase_cost'] = MathService.fixFloat1(keg['purchase_cost']);
          keg['deposit'] = MathService.fixFloat1(keg['deposit']);
          // when we get kegs from server, the param names 'volume' and 'unit'
          // don't match beverage params 'purchase_volume' and 'purchase_unit',
          // so we duplicate and rename so the proper vol and unit show up
          // on client display
          keg['purchase_volume'] = keg['volume'];
          keg['purchase_unit'] = keg['unit'];
          // as a last hack, add distributor as product and brewery so sorting 
          // by those keys works
          keg['product'] = keg['distributor'];
          keg['brewery'] = keg['distributor'];

          keg['container_type'] = 'Empty Keg';
          keg['display_name'] = $scope.getDisplayName(keg);
          keg['icon'] = $scope.getBevIcon(keg);
        }
      }
      else {
        $scope.all_kegs = [];
      }

      $scope.cleanUpExistingInv();
    }).
    error(function(data, status, headers, config) {

    });
  }

  $scope.cleanUpExistingInv = function() {
    // On the client side, remove any entries in add_inv_existing_bevs
    // which are already in this location
    var clean_bevs = [];
    for (var i=0; i < $scope.add_inv_all_bevs.length; i++) {

      var is_clean = true;
      var test_item = $scope.add_inv_all_bevs[i];
      for (var j=0; j < $scope.inv_items.length; j++) {
        var check_item = $scope.inv_items[j];
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
    $scope.add_inv_existing_bevs = clean_bevs;

    // now clean kegs
    var clean_kegs = [];
    for (var i=0; i < $scope.all_kegs.length; i++) {
      var is_clean = true;
      var test_item = $scope.all_kegs[i];
      for (var j=0; j < $scope.inv_items.length; j++) {
        var check_item = $scope.inv_items[j];
        if (check_item['type'] === "bev") {
          continue;
        }
        if (test_item['version_id'] == check_item['version_id'])
        {
          is_clean = false;
          break;
        }
      }
      if (is_clean) {
        clean_kegs.push(test_item);
      }
    }
    $scope.add_inv_existing_kegs = clean_kegs;
  };

  $scope.addInvAddBev = function(bev) {
    $http.post('/inv/loc', {
      id:bev.id, 
      location: $scope.selected_loc.name,
      type:'bev'
    }).
    success(function(data, status, headers, config) {

      console.log(data);

      var bev_clone = JSON.parse( JSON.stringify( bev ) );

      bev_clone['quantity'] = 0;
      bev_clone['inventory'] = 0;

      if (data !== null && typeof data === 'object') {
        if ('quantity' in data) {
          bev_clone.quantity = data['quantity'];
        }
        if ('inventory' in data) {
          bev_clone.inventory = data['inventory'];
          $scope.total_inventory += data['inventory'];
        }
        if ('out_of_date' in data) {
          bev_clone.out_of_date = data['out_of_date']
        }
      }

      $scope.inv_items.push(bev_clone);

      // XXX remove added item from $scope.add_inv_existing_bevs manually
      for ( var i=$scope.add_inv_existing_bevs.length-1; i >= 0; i--) {
        if ( $scope.add_inv_existing_bevs[i].id === bev_clone.id) {
          $scope.add_inv_existing_bevs.splice(i, 1);
          break;
        }
      }

      $scope.addInvControl.addNewBevSuccess(bev);

      $scope.sortBy($scope.sort_key);
      $scope.sortBy($scope.sort_key);
    }).
    error(function(data, status, headers, config) {
    });
  };

  $scope.addInvAddKeg = function(keg) {
    console.log(keg);
    $http.post('/inv/loc', {
      id:keg.id, 
      location: $scope.selected_loc.name,
      type:'keg'
    }).
    success(function(data, status, headers, config) {

      console.log(data);

      var keg_clone = JSON.parse( JSON.stringify( keg ) );

      // XXX push new keg onto location's inventory items
      // XXX if new keg not in all inventory, push into
      keg_clone['quantity'] = 0;
      keg_clone['inventory'] = 0;

      if (data !== null && typeof data === 'object') {
        if ('quantity' in data) {
          keg_clone.quantity = data['quantity'];
        }
        if ('inventory' in data) {
          keg_clone.inventory = data['inventory'];
          $scope.total_inventory += data['inventory'];
        }
        if ('out_of_date' in data) {
          keg_clone.out_of_date = data['out_of_date']
        }
      }

      $scope.inv_items.push(keg_clone);
      // XXX remove added item from $scope.all_kegs manually
      for ( var i=$scope.add_inv_existing_kegs.length-1; i >= 0; i--) {
        if ( $scope.add_inv_existing_kegs[i].id === keg_clone.id) {
          $scope.add_inv_existing_kegs.splice(i, 1);
          break;
        }
      }
     
      $scope.addInvControl.addNewKegSuccess(keg);

      $scope.sortBy($scope.sort_key);
      $scope.sortBy($scope.sort_key);
    }).
    error(function(data, status, headers, config) {
    });
  };

  $scope.removeInvItem = function(index) {
    console.log(index);
    var item = $scope.inv_items[index];
    var item_name = item.product;
    if (item.type==='keg') {
      item_name = "Keg Deposit - " + item.distributor + " " + MathService.fixFloat1(item.purchase_volume) + " " + item.purchase_unit;
    }
    swal({
      title: "Remove Item?",
      text: "This will remove <b>" + item_name + "</b> from " + $scope.selected_loc.name + ".<br/><br/>It will not affect other locations which carry the item, or its entry in the Beverage DB.",
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
            location:$scope.selected_loc.name,
            type:item.type,
            tz_offset:DateService.timeZoneOffset()
          }
        }).
        success(function(data, status, headers, config) {
          $scope.getLocInv();
          swal("Removed!", item.name + " has been removed.", "success");

          // push item back into add_inv_existing_bevs
          item['inventory'] = 0;
          item['quantity'] = 0;
          if (item.type==='bev') {
            $scope.add_inv_existing_bevs.push(item);
          } else {
            $scope.add_inv_existing_kegs.push(item);
          }
          
          // re-sort the added items twice to refresh sorting
          $scope.addInvControl.reSort();

          $scope.sortBy($scope.sort_key);
          $scope.sortBy($scope.sort_key);
        }).
        error(function(data, status, headers, config) {

        });
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
      templateUrl: 'startCountModalNew.html',
      controller: 'startCountModalNewCtrl',
      windowClass: 'start-count-modal',
      backdropClass: 'gray-modal-backdrop',
      size: 'md',
      resolve: {
        
      }
    });

    modalStartInstance.result.then(
      // success status
      function( result ) {
        var mode = result[0];
        var count = result[1];

        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is beverage id
        if (mode === 'scratch') {
          $scope.startInv(true, null);
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (mode === 'previous') {
          if (count === 'scratch') {
            $scope.startInv(false, true);
          } else {
            $scope.startInv(false, false);
          }
        }
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.startInv = function(from_scratch, from_zero) {
    //$scope.inv_started = true;

    var existing_items = [];
    if (!from_scratch) {
      existing_items = JSON.parse(JSON.stringify($scope.inv_items));
      if (from_zero) {
        for (var i in existing_items) {
          var item = existing_items[i];
          item['quantity'] = 0;
        }
      }
    }

    var modalStartInstance = $modal.open({
      templateUrl: 'startInvModal.html',
      controller: 'startInvModalCtrl',
      windowClass: 'start-inv-modal',
      backdropClass: 'gray-modal-backdrop',
      size: 'lg',
      backdrop : 'static',
      resolve: {
        all_bevs: function() {
          return $scope.add_inv_all_bevs;
        },
        all_kegs: function() {
          return $scope.all_kegs;
        },
        loc_name: function() {
          return $scope.selected_loc.name;
        },
        existing_items: function() {
          return existing_items;
        }
      }
    });

    modalStartInstance.result.then(
      // success status
      function( result ) {
        var status = result[0];
        var data = result[1];
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is beverage id
        if (status === 'cancel') {
          ;
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (status === 'save') {
          
          // for the selected location, set last_update locally to just now
          for (var i = 0; i < $scope.locations.length; i++) {
            var loc = $scope.locations[i];
            if (loc.name === $scope.selected_loc.name){
              $scope.locations[i].last_update = data['last_update'];
              var pretty_time = DateService.getPrettyTime(data['last_update']);
              $scope.locations[i]['last_update_pretty'] = pretty_time;
              $scope.last_update = pretty_time;
              break;
            }
          };

          // Call get loc inv to guarantee correct values for line items
          $scope.getLocInv();
        }
      }, 
      // error status
      function() {
        ;
      });


    /*
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
    */
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
      post_item_quantities.push({id:inv.id, quantity:parseFloat(inv.quantity), type:inv.type})
      $scope.inv_items[inv_i]['invalid_quantity'] = false;
      $scope.inv_items[inv_i]['add_q'] = null;

      // We locally calculate the new inventory without polling the server
      var value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];

      // always include deposits in value
      if (inv['deposit'] != null) {
        value += inv['deposit'] * inv['quantity'];
      }
      $scope.inv_items[inv_i]['inventory'] = value;
      $scope.inv_items[inv_i]['out_of_date'] = null;
      $scope.total_inventory += value;

      // locally calculate unit_cost for sorting purposes
      var purchase_cost = 0;
      var purchase_count = 1;
      var deposit = 0;
      if (inv['purchase_cost'] !== null) {
        purchase_cost = inv['purchase_cost'];
      }
      if (inv['purchase_count'] !== null) {
        purchase_count = inv['purchase_count'];
      }
      if (inv['deposit'] !== null) {
        deposit = inv['deposit'];
      }
      $scope.inv_items[inv_i]['unit_cost'] = purchase_cost / purchase_count + deposit;
    };

    $http.put('/inv/locnew', {
      items:post_item_quantities,
      location:$scope.selected_loc.name,
      type:$scope.k_loc_type,
      tz_offset:DateService.timeZoneOffset()
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
        if (loc.name === $scope.selected_loc.name){
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
  };

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

  $scope.getLocInv = function() {
    $http.get('/inv/loc', {
      params: {
        name:$scope.selected_loc.name,
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

      // calculate total inventory and unit_cost
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
          value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];
          // always include deposits in value
          if (inv['deposit'] != null) {
            value += inv['deposit'] * inv['quantity'];
          }
        }
        $scope.inv_items[inv_i]['inventory'] = value;
        $scope.total_inventory += value;

        // locally calculate unit_cost for sorting purposes
        var purchase_cost = 0;
        var purchase_count = 1;
        var deposit = 0;
        if (inv['purchase_cost'] !== null) {
          purchase_cost = inv['purchase_cost'];
        }
        if (inv['purchase_count'] !== null) {
          purchase_count = inv['purchase_count'];
        }
        if (inv['deposit'] !== null) {
          deposit = inv['deposit'];
        }
        if ($scope.inv_items[inv_i]['type']==='bev') {
          $scope.inv_items[inv_i]['unit_cost'] = purchase_cost / purchase_count + deposit;
        } else { // keg
          $scope.inv_items[inv_i]['unit_cost'] = deposit;
        }

        // get icon
        inv['icon'] = $scope.getBevIcon(inv);
        inv['display_name'] = $scope.getDisplayName(inv);
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

      console.log($scope.inv_items);

      if ($scope.firstTimeSort) {
        $scope.firstTimeSort = false;
        $scope.sortBy('product');
      }
    }).
    error(function(data, status, headers, config) {

    });
  };

  $scope.sortFunc = function(a, b) {
    var sort_str = $scope.sort_key;
    var isNum = (sort_str === 'unit_cost' || sort_str === 'quantity' || sort_str === 'inventory' || sort_str === 'deposit');
    if (a['type']==='keg' && (sort_str==='product' || sort_str==='brewery')) {
      sort_str = 'distributor';
    }

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

    bev_items.sort($scope.sortFunc);
    keg_items.sort($scope.sortFunc);
    $scope.inv_items = bev_items.concat(keg_items);
    
    //$scope.inv_items.sort($scope.sortFunc);
  };
})


.controller('startCountModalNewCtrl', function($scope, $modalInstance) {

  $scope.show_help = false;
  $scope.is_previous = false;

  $scope.showHelp = function() {
    $scope.show_help = true;
  }

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

  $scope.pickStartItems = function(mode) {
    // mode should be 'scratch' or 'previous'
    if (mode==='previous') {
      $scope.is_previous=true;
    } else {
      $modalInstance.close(['scratch', null]);
    }
  };

  $scope.pickMode = function(mode) {
    // mode should be 'scratch' or 'previous'

    $modalInstance.close(['previous', mode]);

  }

})

.controller('startInvModalCtrl', function($scope, $modalInstance, $modal, $http, DistributorsService, DateService, loc_name, all_bevs, all_kegs, existing_items) {

  $scope.loc_name = loc_name;

  $scope.add_types = ['Beverages', 'Empty Kegs'/*, 'Recently Used in This Location'*/];
  $scope.all_bevs = all_bevs;
  $scope.filtered_bevs = JSON.parse(JSON.stringify(all_bevs));
  $scope.all_kegs = all_kegs;
  $scope.filtered_kegs = JSON.parse(JSON.stringify(all_kegs));

  $scope.add_type = $scope.add_types[0];

  $scope.added_items = [];

  $scope.type_filters = ['All Beverages', 'Beer', 'Cider', 'Wine', 'Liquor', 'Non Alcoholic'];
  $scope.type_filter = $scope.type_filters[0];

  $scope.container_filters = ['All Containers', 'Draft', 'Bottle', 'Can'];
  $scope.container_filter = $scope.container_filters[0];

  $scope.dist_filters = ['All Distributors'];
  $scope.dist_filter = $scope.dist_filters[0];
  $scope.distributors = null;

  $scope.sort_key_bev = 'product';
  $scope.sort_key_keg = 'distributor';
  $scope.double_sort_bev = -1;
  $scope.double_sort_keg = -1;

  $scope.filter_query = {
    query: ''
  };

  // existing_items was passed to us as a cloned array, so no need to re-clone
  $scope.existing_items = existing_items; 
  //console.log("EXISTING");
  //console.log(existing_items);

  $scope.closePopover = function(e) {
    var popups = document.querySelectorAll('.popover');
    if(popups) {
      for(var i=0; i<popups.length; i++) {
        var popup = popups[i];
        var popupElement = angular.element(popup);

        if(popupElement[0].previousSibling!=e.target){
          popupElement.scope().$parent.isOpen=false;
          popupElement.remove();
        }
      }
    }
  };

  $scope.selectAddType = function(type) {
    $scope.add_type = type;

    var doReSort = true;
    if (type === $scope.add_types[1]) {
      if ($scope.distributors === null) {
        $scope.getDistributors();
        doReSort = false;
      }
    }

    if (doReSort) {
      $scope.reSort();
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
        for (var i in $scope.distributors) {
          $scope.dist_filters.push($scope.distributors[i]['name']);
        }
      },
      function(errorPayload) {
        ; // do nothing for now
      });

    $scope.reSort();
  };

  $scope.selectContainer = function(cont) {

    var check_cont = cont;
    if (check_cont==='Draft') {
      check_cont = "Keg";
    }

    if (check_cont===$scope.container_filter) {
      return;
    }

    $scope.container_filter = check_cont;

    $scope.applyTypeFilter();
  };

  $scope.selectType = function(type) {

    var check_type = type;
    if (check_type==='Non-Alc.') {
      check_type = "Non Alcoholic";
    };

    if (check_type===$scope.type_filter) {
      return;
    }

    $scope.type_filter = check_type;

    // reset container filters when type filter has changed
    if (check_type===$scope.type_filters[0]) {
      $scope.container_filters = ['All Containers', 'Draft', 'Bottle', 'Can'];
    }
    else if (check_type==='Beer' || check_type==='Cider') {
      $scope.container_filters = ['All Containers', 'Draft', 'Bottle', 'Can'];
    } else if (check_type==='Wine' || check_type==='Liquor') {
      $scope.container_filters = ['All Containers', 'Bottle'];
    } else {
      $scope.container_filters = ['All Containers', 'Bottle', 'Can'];
    }
    $scope.container_filter = $scope.container_filters[0];

    $scope.applyTypeFilter();
  }

  $scope.applyTypeFilter = function() {
    // filter by eg Beer, Cider, Wine, etc
    // all beverages
    if ($scope.add_type===$scope.add_types[0]) {

      $scope.filtered_bevs = [];

      if ($scope.type_filter===$scope.type_filters[0]) {
        $scope.filtered_bevs = $scope.all_bevs;
      } else {
        for (var i in $scope.all_bevs) {
          var item = $scope.all_bevs[i];
          if (item.alcohol_type===$scope.type_filter) {
            $scope.filtered_bevs.push(item);
          }
        }
      } 
    }

    // refresh container filter
    $scope.applyContainerFilter();
  };

  $scope.applyContainerFilter = function() {
    // all beverages
    if ($scope.add_type===$scope.add_types[0]) {

      if ($scope.container_filter===$scope.container_filters[0]) {
        // With All Containers selected there is nothing to do
        ;
      } else {
        var container_bevs = [];
        for (var i in $scope.filtered_bevs) {
          var item = $scope.filtered_bevs[i];
          if (item.container_type===$scope.container_filter) {
            container_bevs.push(item);
          }
        }
        $scope.filtered_bevs = container_bevs;
      }
    }

    $scope.excludeAddedBevs();
  };

  $scope.excludeAddedBevs = function() {
    var new_bevs = [];
    for (var i in $scope.filtered_bevs) {
      var bev = $scope.filtered_bevs[i];
      var is_added = false;
      for (var j in $scope.added_items) {
        var added = $scope.added_items[j];
        if (bev.type===added.type && bev.version_id===added.version_id) {
          is_added = true;
          break;
        }
      }
      if (!is_added){ 
        new_bevs.push(bev);
      }
    }

    $scope.filtered_bevs = new_bevs;

    $scope.reSort();
  };

  $scope.selectDistributorFilter = function(dist) {
    $scope.dist_filter = dist;

    $scope.applyDistributorFilter();
  };

  $scope.applyDistributorFilter = function() {
    if ($scope.dist_filter===$scope.dist_filters[0]) {
      // With All Distributors selected there is nothing to do
      $scope.filtered_kegs = $scope.all_kegs;
    } else {
      console.log($scope.dist_filter);
      var dist_kegs = [];
      for (var i in $scope.all_kegs) {
        var item = $scope.all_kegs[i];
        if (item.distributor===$scope.dist_filter) {
          dist_kegs.push(item);
        }
      }
      $scope.filtered_kegs = dist_kegs;
    }

    $scope.excludeAddedKegs();
  };

  $scope.excludeAddedKegs = function() {
    var new_kegs = [];
    for (var i in $scope.filtered_kegs) {
      var keg = $scope.filtered_kegs[i];
      var is_added = false;
      for (var j in $scope.added_items) {
        var added = $scope.added_items[j];
        if (keg.type===added.type && keg.version_id===added.version_id) {
          is_added = true;
          break;
        }
      }
      if (!is_added){ 
        new_kegs.push(keg);
      }
    }

    $scope.filtered_kegs = new_kegs;

    $scope.reSort();
  }

  $scope.addBevToList = function(item) {
    for (var i in $scope.filtered_bevs) {
      var check_item = $scope.filtered_bevs[i];
      if (check_item.version_id === item.version_id) {
        $scope.filtered_bevs.splice(i, 1);
        break;
      }
    }
    $scope.added_items.push(item);
  };

  $scope.addKegToList = function(item) {
    for (var i in $scope.filtered_kegs) {
      var check_item = $scope.filtered_kegs[i];
      if (check_item.version_id === item.version_id) {
        $scope.filtered_kegs.splice(i, 1);
        break;
      }
    }
    $scope.added_items.push(item);
  };

  $scope.addInvToList = function(item) {
    if ($scope.add_type === $scope.add_types[0]) {
      $scope.addBevToList(item);
    } else if ($scope.add_type === $scope.add_types[1]) {
      $scope.addKegToList(item);
    }
  };

  $scope.applyExisting = function() {
    for (var i in $scope.existing_items) {
      // adding to list will both add to added list, and remove from unadded list
      $scope.addInvToList($scope.existing_items[i]);
    };
  };
  $scope.applyExisting();

  $scope.removeAddedItem = function(item) {
    // removing item means removing from $scope.added_items
    // and (potentially) restoring it to filtered_bevs / filtered_kegs
    // based on current filtering criteria.  Need to also zero out its quantity.

    console.log('REMOVE');
    console.log(item);

    item.quantity = 0;

    for (var i in $scope.added_items) {
      var a_item = $scope.added_items[i];
      if (item.id === a_item.id && item.type === a_item.type) {
        $scope.added_items.splice(i, 1);
        console.log(i);
        break;
      }
    }

    // Check type and container filter to determine if should add back to
    // filtered_bevs
    if (item.type==='bev') {
      if ($scope.container_filter !== $scope.container_filters[0] && item.container_type !== $scope.container_filter) {
        ;
      } else if ($scope.type_filter !== $scope.type_filters[0] && item.alcohol_type !== $scope.type_filter) {
        ;
      } else {
        $scope.filtered_bevs.push(item);
        $scope.reSort();
      }
    } else if (item.type==='keg') {
      if ($scope.dist_filter !== $scope.dist_filters[0] && item.distributor !== $scope.dist_filter) {
        ;
      } else {
        $scope.filtered_kegs.push(item);
        $scope.reSort();
      }
    }

    setInterval(
      function() {
        $scope.$apply();
      }, 0);

  };

  $scope.promptRemoveItem = function(item) {

    var prompt = '';
    if (item.type==='bev') {
      prompt = "This will remove <b>" + item.product + "</b> from the added inventory list.  Continue?"
    } else if (item.type==='keg') {

    }

    swal({
      title: "Remove Item?",
      text: prompt,
      type: "warning",
      html: true,
      showCancelButton: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $scope.removeAddedItem(item);
      });
  };

  $scope.reSort = function() {
    if ($scope.add_type===$scope.add_types[0]) {

      $scope.sortBevsBy($scope.sort_key_bev);
      $scope.sortBevsBy($scope.sort_key_bev);

    } else if ($scope.add_type===$scope.add_types[1]) {
      $scope.sortKegsBy($scope.sort_key_keg);
      $scope.sortKegsBy($scope.sort_key_keg);

    }
  };

  $scope.sortBevsBy = function(sort_str) {
    var double_sort = sort_str === $scope.sort_key_bev;
    if (double_sort) {
      $scope.double_sort_bev *= -1;
    } else {
      $scope.double_sort_bev = -1;
    }
    $scope.sort_key_bev = sort_str;
    //var isNum = (sort_str === 'unit_cost' || sort_str === 'quantity' || sort_str === 'inventory' || sort_str === 'deposit');
    var isNum = false;

    $scope.filtered_bevs.sort(function(a, b) {
      var keyA = a[sort_str];
      var keyB = b[sort_str];
      if ($scope.double_sort_bev > 0) {
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

  $scope.sortKegsBy = function(sort_str) {
    var double_sort = sort_str === $scope.sort_key_keg;
    if (double_sort) {
      $scope.double_sort_keg *= -1;
    } else {
      $scope.double_sort_keg = -1;
    }
    $scope.sort_key_keg = sort_str;
    var isNum = (sort_str === 'deposit');

    $scope.filtered_kegs.sort(function(a, b) {
      var keyA = a[sort_str];
      var keyB = b[sort_str];
      if ($scope.double_sort_keg > 0) {
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
  $scope.reSort();
  $scope.reSort();

  $scope.enterInvQuantity = function(item, is_edit) {

    if (!is_edit) {
      item.quantity = 0;
    }
    
    var modalStartInstance = $modal.open({
      templateUrl: 'modalInvQuantity.html',
      controller: 'modalInvQuantityCtrl',
      windowClass: 'inv-qty-modal',
      backdropClass: 'gray-modal-backdrop',
      size: 'sm',
      resolve: {
        item: function() {
          return item;
        },
        is_edit: function() {
          return is_edit;
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
          item.quantity = 0;
        }
        // after a save, we want to re-calculate cost per mL, for instance
        else if (status === 'save') {
          console.log(item);

          if ($scope.add_type === $scope.add_types[0]) {
            $scope.addBevToList(item);
          } else if ($scope.add_type === $scope.add_types[1]) {
            $scope.addKegToList(item);
          }
        } else if (status === 'edit') {
          ;
        }
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.saveInv = function() {

    var hasNaNs = false;
    // first check that all update quantities are valid numbers
    for (var i in $scope.added_items) {
      var inv = $scope.added_items[i];
      if (isNaN(inv.quantity) || inv.quantity < 0) {
        $scope.added_items[i]['invalid_quantity'] = true;
        hasNaNs = true;
      }
      else {
        $scope.added_items[i]['invalid_quantity'] = false;
      }
    }
    if (hasNaNs) {
      //$scope.update_failure_msg = "Please fix invalid quantities highlighted in red and try again!";
      return;
    }

    //$scope.update_failure_msg = "";

    // inv_started shows the quantity adjustment UI

    $scope.total_inventory = 0;
    var post_item_quantities = []
    for (var i in $scope.added_items) {
      var inv = $scope.added_items[i];
      console.log(inv.product);
      console.log(inv.quantity);
      post_item_quantities.push({id:inv.id, quantity:parseFloat(inv.quantity), type:inv.type})
      $scope.added_items[i]['invalid_quantity'] = false;
      $scope.added_items[i]['add_q'] = null;

      // We locally calculate the new inventory without polling the server
      var value = inv['purchase_cost'] / inv['purchase_count'] * inv['quantity'];

      // always include deposits in value
      if (inv['deposit'] != null) {
        value += inv['deposit'] * inv['quantity'];
      }
      $scope.added_items[i]['inventory'] = value;
      $scope.added_items[i]['out_of_date'] = null;
      $scope.total_inventory += value;

      // locally calculate unit_cost for sorting purposes
      var purchase_cost = 0;
      var purchase_count = 1;
      var deposit = 0;
      if (inv['purchase_cost'] !== null) {
        purchase_cost = inv['purchase_cost'];
      }
      if (inv['purchase_count'] !== null) {
        purchase_count = inv['purchase_count'];
      }
      if (inv['deposit'] !== null) {
        deposit = inv['deposit'];
      }
      $scope.added_items[i]['unit_cost'] = purchase_cost / purchase_count + deposit;
    };

    $http.put('/inv/locnew', {
      items:post_item_quantities,
      location:$scope.loc_name,
      type:"bev",
      tz_offset:DateService.timeZoneOffset()
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

      // return data to calling controller
      var return_data = {};
      // server redundantly returns total inventory, set it just in case
      return_data['total_inventory'] = data['total_inventory'];
      return_data['last_update'] = data['last_update'];

      $modalInstance.close(['save', return_data]);
    }).
    error(function(data, status, headers, config) {

    });
  }

  $scope.cancelInv = function() {
    $modalInstance.dismiss(['cancel', null]);
  };
})

.controller('modalInvQuantityCtrl', function($scope, $modalInstance, item, is_edit) {

  $scope.item = item;
  $scope.is_edit = is_edit;
  if (is_edit) {
    $scope.quantity = item.quantity;
  } else {
    $scope.quantity = 0;
  }

  $scope.new_failure_msg = null;

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

    if (isAddQ) {
      inv.add_q = null;
    }
  };

  $scope.save = function() {

    $scope.new_failure_msg = null;

    // first do error check
    if (isNaN($scope.quantity) || $scope.quantity < 0) {
      $scope.new_failure_msg = "Please enter a valid quantity!";
      return;
    };

    $scope.item.quantity = $scope.quantity;

    if ($scope.is_edit) {
      $modalInstance.close(['edit', null]);
    } else {
      $modalInstance.close(['save', $scope.item]);
    }
    
  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

});
