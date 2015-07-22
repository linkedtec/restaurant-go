'use strict';

angular.module('myApp.viewDistributors', ['ngRoute', 'ui.bootstrap'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/viewDistributors', {
    templateUrl: 'view_distributors/view_distributors.html',
    controller: 'ViewDistributorsCtrl'
  });
}])

.controller('ViewDistributorsCtrl', function($scope, $modal, $http, MathService, DistributorsService, VolUnitsService) {

  $scope.show_add_ui = false;

  // filter search query, needs to be object and not string
  $scope.all_dist_query = {query:""};

  $scope.firstTimeSort = true;

  $scope.volume_units = ["L", "mL", "oz", "pt", "qt", "gal"];
  $scope.distributors = [];

  $scope.newDistControl = {};

  // sorting
  $scope.sort_key = null;
  $scope.double_sort = -1;
  $scope.firstTimeSort = true;

  // Shows the add new distributor UI box
  $scope.showAddDistributor = function() {
    $scope.show_add_ui=true;
  };

  $scope.hideAddDistributor = function() {
    $scope.show_add_ui=false;
    $scope.newDistControl.clearSuccessMsg();
    $scope.newDistControl.clearNewForm();
  };

  $scope.getDistributors = function() {

    var result = DistributorsService.get();
    result.then(
      function(payload) {
        var data = payload.data;
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

        if ($scope.firstTimeSort) {
          $scope.firstTimeSort = false;
          $scope.sortBy('name');
        }
      },
      function(errorPayload) {
        ; // do nothing for now
      });
  };
  $scope.getDistributors();

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
        }
      },
      function(errorPayload) {
        ; // do nothing for now
      });
  };
  $scope.getVolUnits();

  $scope.editDistributor = function(dist) {

    $scope.edit_dist = dist.id;

    var modalEditInstance = $modal.open({
      templateUrl: 'editDistModal.html',
      controller: 'editDistModalCtrl',
      windowClass: 'edit-dist-modal',
      backdropClass: 'green-modal-backdrop',
      resolve: {
        distributor: function() {
          return dist;
        },
        distributors: function() {
          return $scope.distributors;
        },
        volume_units: function() {
          return $scope.volume_units;
        }
      }
    });

    modalEditInstance.result.then(
      // success status
      function( result ) {
        // result is a list, first item is string for status, e.g.,
        // 'save' or 'delete'
        // second item is old distributor id
        // third item is new distributor id
        var status = result[0];
        var dist_id = result[1];
        var new_dist_id = result[2];
        if (status === 'delete') {
          var dist_name;
          for (var i = $scope.distributors.length-1; i >= 0; i--) {
            var dist = $scope.distributors[i];
            if (dist.id === dist_id) {
              dist_name = dist.name;
              $scope.distributors.splice(i, 1);
              break;
            }
          }
          swal({
            title: "Distributor Deleted!",
            text: "<b>" + dist_name + "</b> has been removed from the system.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
        }
        // after a save, we want to update client version
        else if (status === 'save') {
          var dist_name;
          for (var i=0; i < $scope.distributors.length; i++) {
            var dist = $scope.distributors[i];
            if (dist.id === dist_id) {
              dist_name = dist.name;

              // update the dist id with the new id
              if (new_dist_id !== null) {
                $scope.distributors[i]['id'] = new_dist_id;
              }

              break;
            }
          }
          swal({
            title: "Distributor Updated!",
            text: "<b>" + dist_name + "</b> has been updated with your changes.",
            type: "success",
            timer: 4000,
            allowOutsideClick: true,
            html: true});
        }
      }, 
      // error status
      function() {
        // when modal is exited, e.g., clicking outside

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
    var isNum = (sort_str === 'bev_count');
    
    $scope.distributors.sort(function(a, b) {
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

  // this doesn't actually close the add UI, but adds the new distributor
  // object to the list of distributors, and does some post-add sorting.
  $scope.newDistributorCloseOnSave = function(new_distributor) {

    $scope.distributors.push(new_distributor);

    // after saving new distributor, re-sort the distributors
    $scope.sortBy($scope.sort_key);
    $scope.sortBy($scope.sort_key);

  };

})

.controller('editDistModalCtrl', function($scope, $modalInstance, $modal, $http, $filter, DistributorsService, MathService, distributor, distributors, volume_units) {

  $scope.volume_units = volume_units;

  // original_distributor is a pointer back to the distributor object instance
  // and should be written to on save.
  // distributor is a clone of the original distributor so edits do not affect 
  // existing distributor object until user saves
  // Before cloning, convert float params to floats to avoid small rounding 
  // annoyances such as 0.06 showing up as 0.0599999999999934123912399
  if (distributor.kegs !== null) {
    for (var i in distributor.kegs) {
      if (distributor.kegs[i]['deposit'] !== null) {
        distributor.kegs[i]['deposit'] = parseFloat(distributor.kegs[i]['deposit'].toFixed(2));
      }
      if (distributor.kegs[i]['volume'] !== null) {
        distributor.kegs[i]['volume'] = parseFloat(distributor.kegs[i]['volume'].toFixed(2));
      }
    }
  }
  $scope.original_distributor = distributor;
  $scope.distributor = JSON.parse( JSON.stringify( distributor ) );
  // add an 'editing' field to kegs to signify if they are currently being edited
  for (var i in $scope.distributor.kegs) {
    $scope.distributor.kegs[i]['editing'] = false;
  }
  $scope.distributors = distributors;

  $scope.edit_name = $scope.distributor.name;

  // form verification
  $scope.form_ver = {};
  $scope.form_ver.error_name = false;
  $scope.form_ver.error_volumes = [];
  $scope.form_ver.error_units = [];
  $scope.form_ver.error_deposits = [];

  $scope.keg_exists_error = null;
  $scope.new_failure_msg = null;

  $scope.saveDistName = function(new_name) {

    $scope.form_ver.error_name = false;

    if (new_name===null || new_name.length===0) {
      $scope.new_failure_msg = "Name cannot be blank!";
      $scope.form_ver.error_name = true;
      return;
    }

    if (new_name.length >= 32) {
      $scope.new_failure_msg = "Name is too long (32 character limit)!";
      $scope.form_ver.error_name = true;
      return;
    }

    for (var i in $scope.distributors) {
      if (parseInt($scope.distributors[i].id === parseInt(i))) {
        continue;
      }
      console.log($scope.distributors.name)
      if ($scope.distributors[i].name === new_name) {
        $scope.new_failure_msg = "You already have a distributor named " + new_name + "!  Distributor names must be unique.";
        $scope.form_ver.error_name = true;
        return;
      }
    }

    var old_name = $scope.distributor.name;

    $scope.distributor.name = new_name;
    $scope.edit_name = new_name;

    var result = DistributorsService.put($scope.distributor, ['name']);
    result.then(
      function(payload) {
        $scope.original_distributor.name = new_name;

        swal({
          title: "Distributor Name Saved!",
          text: "Distributor " + old_name + " has been renamed to <b>" + new_name + "</b>!",
          type: "success",
          timer: 4000,
          allowOutsideClick: true,
          html: true});
      },
      function(errorPayload) {
        $scope.distributor.name = old_name;
        $scope.edit_name = old_name;
      });

  };

  $scope.revertDistName = function() {
    $scope.edit_name = $scope.distributor.name;
    $scope.form_ver.error_name = false;
    $scope.new_failure_msg = null;
  };

  $scope.editKeg = function(index) {
    $scope.distributor.kegs[index]['editing'] = true;
  };

  $scope.kegChanged = function(index) {
    if (index >= $scope.original_distributor.kegs.length) {
      return;
    }
    // on change, see if this keg has changed from the original keg's values,
    // for e.g., showing the save button.
    var keg = $scope.distributor.kegs[index];
    var okeg = $scope.original_distributor.kegs[index];
    if (keg.volume !== okeg.volume || keg.unit !== okeg.unit || keg.deposit !== okeg.deposit) {
      $scope.distributor.kegs[index]['changed'] = true;
    } else {
      $scope.distributor.kegs[index]['changed'] = false;
    }
  };

  $scope.clearKegFormVer = function(index) {
    $scope.form_ver.error_volumes[index] = false;
    $scope.form_ver.error_units[index] = false;
    $scope.form_ver.error_deposits[index] = false;
  };

  $scope.cancelEditKeg = function(index) {

    // if this keg was added (and not edited) and the user cancels, remove it
    if ($scope.original_distributor.kegs===null || index >= $scope.original_distributor.kegs.length) {
      $scope.distributor.kegs.splice(index, 1);
      $scope.keg_exists_error = null;
      $scope.new_failure_msg = null;
      $scope.clearKegFormVer(index);
      return;
    }

    $scope.distributor.kegs[index]['editing'] = false;
    $scope.distributor.kegs[index]['changed'] = false;
    var okeg = $scope.original_distributor.kegs[index];

    $scope.distributor.kegs[index]['volume'] = okeg.volume;
    $scope.distributor.kegs[index]['unit'] = okeg.unit;
    $scope.distributor.kegs[index]['deposit'] = okeg.deposit;

  };

  $scope.addNewKeg = function(unit) {
    $scope.distributor['kegs'].push({volume:null, unit:unit, deposit:null, editing:true, is_new:true});
  };

  $scope.saveKeg = function(index) {

    var is_new = (index >= $scope.original_distributor.kegs.length);

    $scope.keg_exists_error = null;
    $scope.new_failure_msg = null;
    $scope.clearKegFormVer(index);
    
    var keg = $scope.distributor.kegs[index];

    var new_vol = keg.volume;
    var new_unit = keg.unit;
    var new_deposit = keg.deposit;

    // first check volume and unit do not overlap with existing kegs
    for (var i in $scope.original_distributor.kegs) {

      if (parseInt(i) === parseInt(index)) {
        continue;
      }
      var oldKeg = $scope.original_distributor.kegs[i];
      if (oldKeg.volume===new_vol && oldKeg.unit===new_unit) {
        $scope.keg_exists_error = "This keg volume already exists for this distributor!  All keg volumes for a distributor must be unique.";
        $scope.form_ver.error_volumes[index] = true;
        $scope.form_ver.error_units[index] = true;
        return;
      }
    }

    var all_clear = true;

    // new volume is not null and is a number
    if (new_vol===null || new_vol==='') {
      $scope.form_ver.error_volumes[index] = true;
      all_clear = false;
    } else if (MathService.numIsInvalid(new_vol)) {
      $scope.form_ver.error_volumes[index] = true;
      all_clear = false;
    }

    // new unit is not null
    if (new_unit===null || new_unit==='' || new_unit===undefined) {
      $scope.form_ver.error_units[index] = true;
      all_clear = false;
    }

    // new deposit is a number (if it's not null)
    if (new_deposit!==null && new_deposit!=='' && MathService.numIsInvalid(new_deposit)) {
      $scope.form_ver.error_deposits[index] = true;
      all_clear = false;
    }

    if (!all_clear) {
      $scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
      return;
    }

    // now post to server
    if (is_new) {
      $scope.postNewKegToServer(keg, index);
    } else {
      $scope.postEditKegToServer(keg, index);
    }

  };

  $scope.postNewKegToServer = function(keg, index) {

    $http.post('/kegs', {
      distributor_id:$scope.distributor.id,
      volume:keg.volume,
      unit:keg.unit,
      deposit:keg.deposit
    }).
      success(function(data, status, headers, config) {
        console.log(data)

        $scope.distributor.kegs[index] = data;
        $scope.distributor.kegs[index]['editing'] = false;

        // update client distributors page with the new keg
        var keg_clone = JSON.parse( JSON.stringify( $scope.distributor.kegs[index] ) );
        $scope.original_distributor.kegs.push(keg_clone);

      }).
      error(function(data, status, headers, config) {
      });
  };

  $scope.postEditKegToServer = function(keg, index) {

    // get the attributes that have changed from the original

    var okeg = $scope.original_distributor.kegs[index];

    var changedKeys = [];     // store which keys changed
    for (var key in keg) {
      if (okeg.hasOwnProperty(key)) {
        // only process volume, unit, and deposit
        if (key !== 'volume' && key !== 'unit' && key!=='deposit') {
          continue;
        }
        
        if (okeg[key] !== keg[key]) {
          changedKeys.push(key);
        }
      }
    }
    if (changedKeys.length == 0) {
      console.log('canceling');
      $scope.cancelEditKeg(index);
      return;
    }

    if (keg.bev_count > 0) {
      var bev_str = "";
      if (keg.bev_count === 1) {
        bev_str = "<b>1 Beverage</b> which is currently";
      } else {
        bev_str = "<b>" + keg.bev_count.toString() + " Beverages</b> which are currently";
      }
      swal({
        title: "Save Keg Changes?",
        text: "This change will affect " + bev_str + " associated with this Keg, along with its future inventory values.<br/><br/>Are you sure?",
        type: "warning",
        showCancelButton: true,
        html: true,
        confirmButtonColor: "#51a351",
        confirmButtonText: "Yes, save changes!",
        closeOnConfirm: true },
        function() {
          $scope.commitPost(keg, index, changedKeys);
      });
    } else {
      $scope.commitPost(keg, index, changedKeys);
    }
    
  };

  $scope.commitPost = function(keg, index, changedKeys) {
    // now put the values of the *changed* keys to the server
    var putObj = {};
    for (var i in changedKeys) {
      var key = changedKeys[i];
      putObj[key] = keg[key];
    }
    putObj.id = keg.id;

    $http.put('/kegs', {
      keg:putObj,
      change_keys:changedKeys
    }).
    success(function(data, status, headers, config) {
      console.log(data)

      $scope.distributor.kegs[index] = data;
      $scope.distributor.kegs[index]['editing'] = false;

      // update client distributors page with the edited keg
      var keg_clone = JSON.parse( JSON.stringify( $scope.distributor.kegs[index] ) );
      $scope.original_distributor.kegs[index] = keg_clone;

    }).
    error(function(data, status, headers, config) {
    });
  };

  $scope.removeKegRow = function(index) {
    $scope.distributor['kegs'].splice(index, 1);
  };

  if ($scope.distributor['kegs'] === null || $scope.distributor['kegs'].length == 0) {
    $scope.distributor['kegs'] = [];
  };
  console.log($scope.distributor.kegs)
  for (var i in $scope.distributor.kegs) {
    $scope.clearKegFormVer(i);
  }
  
  console.log($scope.distributor);

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

  $scope.saveChanges = function() {

    $scope.new_failure_msg = null;

    var all_clear = true;

    // check all necessary fields are present
    if ($scope.distributor['name'] === null || $scope.distributor['name'] === '' )
    {
      $scope.form_ver.error_name = true;
      all_clear = false;
    } else {
      $scope.form_ver.error_name = false;
    }

    // Collect the final list of kegs.
    var final_kegs = []
    for (var keg_i in $scope.distributor['kegs'])
    {
      var keg = $scope.distributor['kegs'][keg_i];
      // if volume, unit and deposit are null, discard
      if (keg['volume'] === null && keg['unit'] === null && keg['deposit'] === null) {
        continue;
      }
      final_kegs.push(keg);
    }

    for (var keg_i in final_kegs)
    {
      var keg = final_kegs[keg_i];

      if (keg.volume===null || keg.volume==='' || keg.unit===null || keg.unit==='') {
        $scope.form_ver.errors_kegs_volume[keg_i] = true;
        all_clear = false;
      } else if (keg.volume!==null && keg.volume!=='' && MathService.numIsInvalid(keg.volume)) {
        $scope.form_ver.errors_kegs_volume[keg_i] = true;
        all_clear = false;
      } else {
        $scope.form_ver.errors_kegs_volume[keg_i] = false;
      }
      if (keg.deposit!==null && keg.deposit!=='' && MathService.numIsInvalid(keg.deposit)) {
        console.log(keg.deposit);
        $scope.form_ver.errors_kegs_deposit[keg_i] = true;
        all_clear = false;
      } else {
        $scope.form_ver.errors_kegs_deposit[keg_i] = false;
      }
    }

    $scope.distributor['kegs'] = final_kegs;

    if (!all_clear) {
      $scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.";
      // if ended up with kegs having length 0, push null row
      if ($scope.distributor['kegs'].length === 0) {
        $scope.distributor['kegs'] = [{volume:null, unit:null, deposit:null}];
      }
      return;
    }

    // Find any diffs between the original and the modified object.
    // Instead of doing a comprehensive generic comparison, we rely on
    // knowing the beverage object's structure to do comparisons (e.g.,
    // the fact that size_prices is an array of objects)
    var changedKeys = [];     // store which keys changed
    for (var key in $scope.distributor) {
      if ($scope.original_distributor.hasOwnProperty(key)) {
        if (key === '__proto__' || key === '$$hashKey') {
          continue;
        }
        // handle known special cases such as size_prices
        else if (key==='kegs') {
          var isSame = true;
          if ($scope.original_distributor.kegs.length != $scope.distributor.kegs.length)
          {
            changedKeys.push(key);
            continue;
          }
          for (var i in $scope.original_distributor.kegs) {
            var okeg = $scope.original_distributor.kegs[i]
            var keg = $scope.distributor.kegs[i];
            if (okeg.deposit != keg.deposit || okeg.unit != keg.unit || okeg.volume != keg.volume) {
              changedKeys.push(key);
              continue;
            }
          }
        }
        else if ($scope.original_distributor[key] != $scope.distributor[key]) {
          changedKeys.push(key);
        }
      }
    }
    if (changedKeys.length == 0) {
      $modalInstance.dismiss();
      return;
    }

    // clone our tmp distributor to the original distributor object to commit 
    // changes on the client side.
    for (var key in $scope.distributor) {
      if ($scope.original_distributor.hasOwnProperty(key)) {
        $scope.original_distributor[key] = $scope.distributor[key];
      }
    }

    // now put the values of the *changed* keys to the server
    var putObj = {};
    for (var i in changedKeys) {
      var key = changedKeys[i];
      putObj[key] = $scope.distributor[key];
    }
    putObj.id = $scope.distributor.id;

    // XXX distributors don't change ids history when edited, but kegs ids
    // might change
    //var new_dist_id = null;
    $http.put('/distributors', {
      distributor:putObj,
      change_keys:changedKeys
    }).
    success(function(data, status, headers, config) {
      // put will return the updated id of the beverage, since saving after
      // editing actually creates a new entry on the server
      console.log(data);
      new_dist_id = data['id'];
      $modalInstance.close(['save', $scope.distributor.id, new_dist_id]);
    }).
    error(function(data, status, headers, config) {
      console.log(data);
    });
  };

  $scope.showConfirmDeleteDistModal = function(dist_bevs) {
    var modalDelInstance = $modal.open({
      templateUrl: 'deleteDistModal.html',
      controller: 'deleteDistModalCtrl',
      windowClass: 'del-dist-modal',
      backdropClass: 'red-modal-backdrop',
      resolve: {
        distributor: function() {
          return $scope.distributor;
        },
        dist_beverages: function() {
          return dist_bevs;
        }
      }
    });

    modalDelInstance.result.then(
      // success status
      function( result ) {
        var status = result[0];
        var dist_id = result[1];
        var new_dist_id = result[2];
        if (status === 'delete') {
          $modalInstance.close(['delete', $scope.distributor.id]);
        }
        
      }, 
      // error status
      function() {
        ;
      });
  };

  $scope.deleteDistributor = function() {
    var dist_id = $scope.original_distributor.id;

    swal({
      title: "Delete Distributor?",
      text: "This will remove <b>" + $scope.original_distributor.name + "</b> from your Distributors, and affect all beverages which are currently carried by this Distributor.<br/><br/>Are you absolutely sure?",
      type: "warning",
      showCancelButton: true,
      html: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        $http.delete('/distributors', {
          params: {
            id:dist_id,
            force:false
        }
        }).
        success(function(data, status, headers, config) {
          console.log(data)
          
          // Note that this is the CHECK call to delete distributors, which
          // will return whether any bev_ids currently reference this 
          // distributor so the user can manually confirm deletion per bev.
          // So we call the second stage of deletion instead of quitting modal.

          if (data==null || data=="")
          {
            $modalInstance.close(['delete', dist_id]);
          } else {
            // if data was returned, we show the confirmation modal which
            // requires user to manually check off all beverages
            $scope.showConfirmDeleteDistModal(data);
          }
          
        }).
        error(function(data, status, headers, config) {
          console.log(data);
        });
    });

  };

  $scope.deleteKeg = function(index) {

    var delKeg = $scope.distributor.kegs[index];
    var keg_id = delKeg.id;
    var keg_volume = delKeg.volume;
    var keg_unit = delKeg.unit;

    swal({
      title: "Delete Keg?",
      text: "This will remove the <b>" + delKeg.volume + " " + delKeg.unit + " Keg</b> from Distributor <b>" + $scope.distributor.name + "</b>, and affect any beverages which currently use this Keg size.<br/><br/>Are you absolutely sure?",
      type: "warning",
      showCancelButton: true,
      html: true,
      confirmButtonColor: "#DD6B55",
      confirmButtonText: "Yes, remove it!",
      closeOnConfirm: true },
      function() {
        // On success, remove distributor keg and old_distributor keg!
        $http.delete('/kegs', {
          params: {
            id:keg_id,
            force:false
          }
        }).
        success(function(data, status, headers, config) {
          console.log(data)
              
          // Note that this is the CHECK call to delete distributors, which
          // will return whether any bev_ids currently reference this 
          // distributor so the user can manually confirm deletion per bev.
          // So we call the second stage of deletion instead of quitting modal.

          if (data==null || data=="")
          {
            $scope.distributor.kegs.splice(index, 1);
            $scope.original_distributor.kegs.splice(index, 1);
            swal({
              title: "Keg Deleted!",
              text: $scope.distributor.name + " <b>" + keg_volume + " " + keg_unit + "</b> Keg has been removed from the system.",
              type: "success",
              timer: 4000,
              allowOutsideClick: true,
              html: true});
          } else {
            // if data was returned, we show the confirmation modal which
            // requires user to manually check off all beverages
            $scope.showConfirmDeleteKegModal($scope.distributor.kegs[index], data);
          }
              
        }).
        error(function(data, status, headers, config) {
          console.log(data);
        });
      });
  }

  $scope.showConfirmDeleteKegModal = function(keg, keg_beverages) {
    var modalDelInstance = $modal.open({
      templateUrl: 'deleteKegModal.html',
      controller: 'deleteKegModalCtrl',
      windowClass: 'del-dist-modal',
      backdropClass: 'red-modal-backdrop',
      resolve: {
        distributor: function() {
          return $scope.distributor;
        },
        keg: function() {
          return keg;
        },
        keg_beverages: function() {
          return keg_beverages;
        }
      }
    });

    modalDelInstance.result.then(
      // success status
      function( result ) {
        var status = result[0];
        var keg_id = result[1];
        var new_keg_id = result[2];
        if (status === 'delete') {
          var keg_volume;
          var keg_unit;
          for (var i = $scope.distributor.kegs.length-1; i >= 0; i--) {
            var keg = $scope.distributor.kegs[i];
            if (keg.id === keg_id) {
              keg_volume = keg.volume;
              keg_unit = keg.unit;
              $scope.distributor.kegs.splice(i, 1);
              $scope.original_distributor.kegs.splice(i, 1);
              break;
            }
          }
          swal({
            title: "Keg Deleted!",
            text: "The " + $scope.distributor.name + " <b>" + keg_volume + " " + keg_unit + " Keg</b> has been removed from the system.",
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

  $scope.showKegHelp = function() {
    swal({
      title: "Distributor Kegs",
      text: "If you order tap beer from your distributor, it most likely comes in a keg with a deposit value.  If you receive kegs of different volumes from this distributor, enter a row for each volume amount and the associated deposit.",
      allowOutsideClick: true,
      html: true});
  };

})

.controller('deleteDistModalCtrl', function($scope, $modalInstance, $http, $filter, MathService, distributor, dist_beverages) {

  $scope.distributor = distributor;
  $scope.dist_beverages = dist_beverages;

  $scope.num_checked = 0;

  $scope.all_checked = false;

  $scope.checkedBeverage = function(index) {
    var cid = "checkbox" + index.toString();

    if (document.getElementById(cid).checked) {
      $scope.num_checked += 1;
    } else {
      $scope.num_checked -= 1;
    }

    if ($scope.num_checked===$scope.dist_beverages.length) {
      $scope.all_checked = true;
    } else {
      $scope.all_checked = false;
    }
  }
  

  $scope.confirmDelete = function() {
    $http.delete('/distributors', {
      params: {
        id:$scope.distributor.id,
        force:true
      }
    }).
    success(function(data, status, headers, config) {
      console.log(data)
          
      $modalInstance.close(['delete', $scope.distributor.id]);
          
    }).
    error(function(data, status, headers, config) {
      console.log(data);
    });
  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };


})

.controller('deleteKegModalCtrl', function($scope, $modalInstance, $http, $filter, MathService, distributor, keg, keg_beverages) {

  $scope.distributor = distributor;
  $scope.keg = keg;
  $scope.keg_beverages = keg_beverages;

  $scope.num_checked = 0;

  $scope.all_checked = false;

  $scope.checkedBeverage = function(index) {
    var cid = "checkbox" + index.toString();

    if (document.getElementById(cid).checked) {
      $scope.num_checked += 1;
    } else {
      $scope.num_checked -= 1;
    }

    if ($scope.num_checked===$scope.keg_beverages.length) {
      $scope.all_checked = true;
    } else {
      $scope.all_checked = false;
    }
  }
  

  $scope.confirmDelete = function() {
    $http.delete('/kegs', {
      params: {
        id:$scope.keg.id,
        force:true
      }
    }).
    success(function(data, status, headers, config) {
      console.log(data)
          
      $modalInstance.close(['delete', $scope.keg.id]);
          
    }).
    error(function(data, status, headers, config) {
      console.log(data);
    });
  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };


});