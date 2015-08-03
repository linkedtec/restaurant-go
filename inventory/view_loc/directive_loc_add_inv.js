angular.module('myApp')

.directive('locAddInv', function($http, KegsService, VolUnitsService, MathService) {
  return {
    restrict: 'AE',
    scope: {
      locName: '=',
      allBeverages: '=',
      allKegs: '=',
      closeOnSave: '&',
      control: '='
    },
    templateUrl: './view_loc/template_loc_add_inv.html',
    link: function(scope, elem, attrs) {

      // provides a way of exposing certain functions to outside controllers
      scope.internalControl = scope.control || {};

      scope.all_add_types = ['Beverages', 'Empty Kegs'];
      scope.add_type = scope.all_add_types[0];
      scope.new_success_msg = null;

      // sorting
      scope.sort_key_bev = 'product';
      scope.double_sort_bev = -1;
      scope.sort_key_kegs = 'distributor';
      scope.double_sort_kegs = -1;

      scope.internalControl.clearState = function() {
        scope.new_success_msg = null;
      };

      scope.internalControl.reSort = function() {
        scope.internalControl.sortBevsBy(scope.sort_key_bev);
        scope.internalControl.sortBevsBy(scope.sort_key_bev);

        scope.internalControl.sortKegsBy(scope.sort_key_kegs);
        scope.internalControl.sortKegsBy(scope.sort_key_kegs);
      };

      scope.selectAddType = function(type) {
        scope.add_type = type;

        scope.internalControl.reSort();
      };

      scope.internalControl.sortBevsBy = function(sort_str) {
        var double_sort = sort_str === scope.sort_key_bev;
        if (double_sort) {
          scope.double_sort_bev *= -1;
        } else {
          scope.double_sort_bev = -1;
        }
        scope.sort_key_bev = sort_str;
        //var isNum = (sort_str === 'unit_cost' || sort_str === 'quantity' || sort_str === 'inventory' || sort_str === 'deposit');
        var isNum = false;

        scope.allBeverages.sort(function(a, b) {
          var keyA = a[sort_str];
          var keyB = b[sort_str];
          if (scope.double_sort_bev > 0) {
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

      scope.internalControl.sortKegsBy = function(sort_str) {
        var double_sort = sort_str === scope.sort_key_kegs;
        if (double_sort) {
          scope.double_sort_kegs *= -1;
        } else {
          scope.double_sort_kegs = -1;
        }
        scope.sort_key_kegs = sort_str;
        var isNum = (sort_str === 'deposit');

        scope.allKegs.sort(function(a, b) {
          var keyA = a[sort_str];
          var keyB = b[sort_str];
          if (scope.double_sort_kegs > 0) {
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

      scope.addNewInv = function(item) {
        if (scope.add_type === scope.all_add_types[0]) {
          scope.addNewBevInv(item);
        } else {
          scope.addNewKegInv(item);
        }
      }

      scope.addNewBevInv = function(bev) {
        console.log ('add existing bev: ' + bev.product);

        $http.post('/inv/loc', {
          id:bev.id, 
          location: scope.locName,
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
            }
          }

          scope.new_success_msg = bev_clone.product + " has been added to " + scope.locName + "!";

          if (scope.closeOnSave !== null) {
            scope.closeOnSave( {inv_type:"bev", add_inv:bev_clone} );
          }

        }).
        error(function(data, status, headers, config) {
        });
      };

      scope.addNewKegInv = function(keg) {

        $http.post('/inv/loc', {
          id:keg.id, 
          location: scope.locName,
          type:'keg'
        }).
        success(function(data, status, headers, config) {

          console.log(data);

          var keg_clone = JSON.parse( JSON.stringify( keg ) );

          // XXX push new keg onto location's inventory items
          // XXX if new keg not in all inventory, push into
          scope.new_success_msg = keg_clone.distributor + " " + keg_clone.volume + " " + keg_clone.unit + " keg has been added to " + scope.locName + "!";
          keg_clone['quantity'] = 0;
          keg_clone['inventory'] = 0;

          if (data !== null && typeof data === 'object') {
            if ('quantity' in data) {
              keg_clone.quantity = data['quantity'];
            }
            if ('inventory' in data) {
              keg_clone.inventory = data['inventory'];
            }
          }

          if (scope.closeOnSave !== null) {
            scope.closeOnSave( {inv_type:"keg", add_inv:keg_clone} );
          }
          
        }).
        error(function(data, status, headers, config) {
        });
      };

    }
  }
});