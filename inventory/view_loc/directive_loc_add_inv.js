angular.module('myApp')

.directive('locAddInv', function($http, KegsService, VolUnitsService, MathService) {
  return {
    restrict: 'AE',
    scope: {
      locName: '=',
      allBeverages: '=',
      allKegs: '=',
      addBevInv: '&',
      addKegInv: '&',
      control: '=',
      showKegs: '=',
      showTabs: '=',
      listHeight: '=',
      breweryDistributor: '='
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

      if (scope.showKegs!==null && scope.showKegs===true) {
        scope.all_add_types = ['Beverages', 'Empty Kegs'];
      } else {
        scope.all_add_types = ['Beverages'];
      }

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
        console.log(item);
        if (scope.add_type === scope.all_add_types[0]) {
          if (scope.addBevInv !== null) {
            scope.addBevInv({bev: item});
          }
        } else {
          if (scope.addKegInv !== null) {
            scope.addKegInv({keg: item});
          }
        }
      };

      scope.internalControl.addNewBevSuccess = function(bev) {
        scope.new_success_msg = bev.product + " has been added to " + scope.locName + "!";
      };

      scope.internalControl.addNewKegSuccess = function(keg) {
        scope.new_success_msg = keg.distributor + " " + keg.volume + " " + keg.unit + " keg has been added to " + scope.locName + "!";
      };

    }
  }
});