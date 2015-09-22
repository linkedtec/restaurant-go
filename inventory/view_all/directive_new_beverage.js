angular.module('myApp')

.directive('newBeverage', function($modal, $http, BeveragesService, VolUnitsService, MathService) {
  return {
    restrict: 'AE',
    scope: {
      allBreweries: '=',   // for typeahead lookup
      allDistributors: '=',
      editBeverage: '=',   // if we're using this to edit instead of create new beverage
      volumeUnits: '=',
      closeOnSave: '&',
      closeOnCancel: '&',
      closeOnDelete: '&',
      control: '=',
      editMode: '='
    },
    templateUrl: './view_all/template_new_beverage.html',
    link: function(scope, elem, attrs) {

      // provides a way of exposing certain functions to outside controllers
      scope.internalControl = scope.control || {};
      scope.is_edit = false;

      scope.new_unit_sale = {value: null};

      // initialize params
      scope.container_types = ["-- Select One --", "Keg", "Bottle", "Can"];
      scope.serve_types = ["-- Select One --", "Single Serve", "Multiple Pours"];
      scope.beverage_types = ["Beer", "Cider", "Wine", "Liquor", "Non Alcoholic"];
      scope.volume_units = ["L", "mL", "oz", "pt", "qt", "gal"];
      scope.new_success_msg = null;
      scope.new_failure_msg = null;
      scope.save_title = "Save";

      scope.addSaleRow = function(unit) {
        scope.new_beverage['size_prices'].push({volume:null, unit:unit, price:null});
      };

      scope.removeSaleRow = function(index) {
        scope.new_beverage['size_prices'].splice(index, 1);
      };

      // create new_beverage object
      // -----------------------------------------------------------------------
      // If editBeverage was passed to us, we want to use editBeverage as the
      // original for comparison, and make a clone of it into new_beverage
      // to make changes.  But first, we'll need to fix up some floats to remove
      // annoying precision issues
      if (scope.editBeverage!==undefined && scope.editBeverage!==null) {
        console.log('edit');
        scope.is_edit=true;

        scope.new_beverage = JSON.parse( JSON.stringify( scope.editBeverage ) );

        // Need to convert new_beverage.serve_type, which is an int, to a string
        // Note we only do this for new_beverage, and not editBeverage.
        // When we save changes, we will convert back to int before comparing the two.
        if (scope.new_beverage.serve_type === 0) {
          scope.new_beverage.serve_type = scope.serve_types[1];
        } else {
          scope.new_beverage.serve_type = scope.serve_types[2];
        }

        // need to handle unit sale price separately from other sale prices
        if (scope.new_beverage['size_prices'] !== null) {
          for (var i = 0; i < scope.new_beverage.size_prices.length; i++)
          {
            var sp = scope.new_beverage.size_prices[i];
            if (sp.unit === 'Unit') {
              scope.new_unit_sale.value = sp.price;
              scope.new_beverage.size_prices.splice(i,1);
              break;
            }
          }
        }

        // we don't call clearNewForm on edit beverage, so manually insert a
        // size_price row if none exist
        if (scope.new_beverage['size_prices'] === null || scope.new_beverage['size_prices'].length == 0) {
          scope.new_beverage['size_prices'] = [];
          scope.addSaleRow(null);
        }

        scope.save_title = "Save Changes"
      } else {
        scope.new_beverage = {};
        scope.new_beverage['container_type'] = scope.container_types[0];
        scope.new_beverage['serve_type'] = scope.serve_types[0];
        scope.new_beverage['alcohol_type'] = scope.beverage_types[0];
        scope.save_title = "Save & Add Beverage"
      }

      scope.internalControl.clearSuccessMsg = function() {
        scope.new_success_msg = null;
      }

      scope.internalControl.clearNewForm = function() {
        if (!scope.is_edit) {
          scope.new_beverage['product'] = null;
          scope.new_beverage['brewery'] = null;
          scope.new_beverage['distributor'] = null;
          scope.new_beverage['keg'] = null;
          // don't clear type, user might want to preserve for next entry
          scope.new_beverage['abv'] = null;
          scope.new_beverage['purchase_volume'] = null;
          scope.new_beverage['purchase_unit'] = null;
          scope.new_beverage['purchase_cost'] = null;
          scope.new_beverage['purchase_count'] = 1;
          scope.new_beverage['deposit'] = null;
          scope.new_beverage['flavor_profile'] = null;
          scope.new_beverage['size_prices'] = [{volume:null, unit:null, price:null}];
          scope.new_unit_sale.value = null;
        }
        
        // form verification
        scope.form_ver = {};
        scope.form_ver.error_container = false;
        scope.form_ver.error_serve_type = false;
        scope.form_ver.error_product = false;
        //scope.form_ver.error_distributor = false;
        //scope.form_ver.error_brewery = false;
        scope.form_ver.error_type = false;
        scope.form_ver.error_abv = false;
        scope.form_ver.error_pvolume = false;
        scope.form_ver.error_punit = false;
        scope.form_ver.error_pcost = false;
        scope.form_ver.error_keg_deposit = false;
        scope.form_ver.error_pcount = false;
        scope.form_ver.error_unit_sale = false;
        scope.form_ver.errors_sale_volume = [];
        scope.form_ver.errors_sale_price = [];
      };

      scope.internalControl.clearNewForm();

      // This is currently being passed by caller, disable for now...
      /*
      scope.getVolUnits = function() {
        var result = VolUnitsService.get();
        result.then(
          function(payload) {
            var data = payload.data;
            if (data !== null) {
              scope.volume_units_full = data;
              scope.volume_units = [];
              for (var i=0; i < data.length; i++)
              {
                scope.volume_units.push(data[i].abbr_name);
              }
            }
          },
          function(errorPayload) {
            ; // do nothing for now
          });
      };
      scope.getVolUnits();
      */

      scope.selectAddType = function(type) {
        scope.new_beverage['alcohol_type'] = type;
        if (scope.new_beverage['alcohol_type'] === 'Beer' || scope.new_beverage['alcohol_type'] === 'Cider') {
          scope.container_types = ["-- Select One --", "Keg", "Bottle", "Can"];
        } else {
          scope.container_types = ["-- Select One --", "Bottle", "Can"];
          if (scope.new_beverage['container_type'] === 'Keg') {
            scope.new_beverage['container_type'] = 'Bottle';
          }
        }

        // when switching to beer, if already have a container and serve type
        // set, automatically change serve type to single serve, unless container
        // is keg
        if ((scope.new_beverage['alcohol_type'] === 'Beer' || scope.new_beverage['alcohol_type'] === 'Cider') && scope.new_beverage['container_type'] !== scope.container_types[0] && scope.new_beverage['serve_type'] !== scope.serve_types[0] && scope.new_beverage['container_type'] !== "Keg") {
          scope.new_beverage['serve_type'] = scope.serve_types[1];
          return;
        }

        // when switching to wine / liquor, if already have a container and serve type
        // set, automatically change serve type to multiple pours, unless it's a can
        if ((scope.new_beverage['alcohol_type'] === 'Wine' || scope.new_beverage['alcohol_type'] === 'Liquor') && scope.new_beverage['container_type'] !== scope.container_types[0] && scope.new_beverage['serve_type'] !== scope.serve_types[0] && scope.new_beverage['container_type'] !== "Can") {
          scope.new_beverage['serve_type'] = scope.serve_types[2];
          return;
        }

        // when switching to non alcoholic, if already have a container and serve type
        // set, automatically change serve type to single serve
        if (scope.new_beverage['alcohol_type'] === 'Non Alcoholic' && scope.new_beverage['container_type'] !== scope.container_types[0] && scope.new_beverage['serve_type'] !== scope.serve_types[0]) {
          scope.new_beverage['serve_type'] = scope.serve_types[1];
          return;
        }
      };

      scope.addContainerChanged = function() {
        if (scope.new_beverage['container_type'] === 'Keg') {
          scope.new_beverage['serve_type'] = scope.serve_types[2];
          scope.new_unit_sale.value = null;
          scope.new_beverage['purchase_count'] = 1;
        } else if (scope.new_beverage['container_type'] === 'Can' && scope.new_beverage['serve_type'] !== scope.serve_types[0]) {
          scope.new_beverage['serve_type'] = scope.serve_types[1];
        } else if ((scope.new_beverage['alcohol_type'] === 'Beer' || scope.new_beverage['alcohol_type'] === 'Cider') && scope.new_beverage['serve_type'] !== scope.serve_types[0]) {
          scope.new_beverage['serve_type'] = scope.serve_types[1];
        } else if ((scope.new_beverage['alcohol_type'] === 'Wine' || scope.new_beverage['alcohol_type'] === 'Liquor') && scope.new_beverage['serve_type'] !== scope.serve_types[0] && scope.new_beverage['container_type'] === 'Bottle') {
          scope.new_beverage['serve_type'] = scope.serve_types[2];
        }
      };

      scope.selectPurchaseUnit = function(unit) {
        scope.new_beverage['purchase_unit'] = unit;
      };

      scope.clearPurchaseUnit = function() {
        scope.new_beverage['purchase_unit'] = null;
      };

      scope.selectSizePriceUnit = function(size_price, unit) {
        size_price['unit'] = unit;
      };

      scope.clearSizePriceUnit = function(size_price) {
        size_price['unit'] = null;
      };

      scope.selectDistributor = function (dist) {
        scope.new_beverage['distributor'] = dist;
        scope.new_beverage['distributor_id'] = dist.id;
        scope.new_beverage['keg'] = null;
        scope.new_beverage['keg_id'] = null;
      };

      scope.clearDistributor = function() {
        scope.new_beverage['distributor'] = null;
        scope.new_beverage['distributor_id'] = null;
        scope.new_beverage['keg'] = null;
        scope.new_beverage['keg_id'] = null;
      }

      scope.selectKeg = function(keg) {

        var old_keg = scope.new_beverage['keg'];

        scope.new_beverage['keg'] = keg;
        scope.new_beverage['keg_id'] = keg.id;

        if (old_keg !== null) {
          // auto-populate purchase volume when keg is selected, if the
          // purchase volume is currently blank
          if (old_keg.volume !== null && old_keg.unit !== null && scope.new_beverage['purchase_volume']===old_keg.volume && scope.new_beverage['purchase_unit']===old_keg.unit) {
            scope.new_beverage['purchase_volume'] = MathService.fixFloat2(keg.volume);
            scope.selectPurchaseUnit(keg.unit);
          }
        } else {
          if (keg.volume !== null && keg.unit !== null && scope.new_beverage['purchase_volume']===null && scope.new_beverage['purchase_unit']===null) {
            scope.new_beverage['purchase_volume'] = MathService.fixFloat2(keg.volume);
            scope.selectPurchaseUnit(keg.unit);
          }
        } 

        
      };

      scope.clearKeg = function() {
        var keg = scope.new_beverage['keg'];
        if (keg === null) {
          return;
        }

        // if purchase volume matches keg, depopulate it
        if (keg.volume===scope.new_beverage['purchase_volume'] && keg.unit===scope.new_beverage['purchase_unit']) {
          scope.new_beverage['purchase_volume'] = null;
          scope.selectPurchaseUnit(null);
        }
        
        scope.new_beverage['keg'] = null;
        scope.new_beverage['keg_id'] = null;

      };

      scope.deleteBeverage = function() {
        var bev_id = scope.new_beverage.id;

        swal({
          title: "Delete Beverage?",
          text: "This will remove <b>" + scope.new_beverage.product + "</b> from the DB, and from all inventory locations which carry it.  This cannot be undone.",
          type: "warning",
          showCancelButton: true,
          html: true,
          confirmButtonColor: "#DD6B55",
          confirmButtonText: "Yes, remove it!",
          closeOnConfirm: false },
          function() {

            var result = BeveragesService.delete(scope.new_beverage.id);
            result.then(
              function(payload) {
                
                if (scope.closeOnDelete !== null) {
                  scope.closeOnDelete();
                }

              },
              function(errorPayload) {
                ; // do nothing for now
              });
        });
      };

      scope.saveBeverage = function() {
    
        scope.new_success_msg = null;
        scope.new_failure_msg = null;

        var all_clear = true;

        // check all necessary fields are present
        if (scope.new_beverage['product'] === null || scope.new_beverage['product'] === '' )
        {
          scope.form_ver.error_product = true;
          all_clear = false;
        } else {
          scope.form_ver.error_product = false;
        }

        if (scope.new_beverage['container_type'] === null || scope.new_beverage['container_type'] === '' || scope.new_beverage['container_type'] === scope.container_types[0] )
        {
          scope.form_ver.error_container=true;
          all_clear = false;
        } else {
          scope.form_ver.error_container=false;
        }

        if (scope.new_beverage['serve_type'] === null || scope.new_beverage['serve_type'] === '' || scope.new_beverage['serve_type'] === scope.serve_types[0] )
        {
          scope.form_ver.error_serve_type=true;
          all_clear = false;
        } else {
          scope.form_ver.error_serve_type=false;
        }

        if ( MathService.numIsInvalid(scope.new_beverage['abv']) )
        {
          scope.form_ver.error_abv=true;
          all_clear = false;
        } else {
          scope.form_ver.error_abv=false;
        }

        scope.form_ver.error_pvolume=false;
        if ( scope.new_beverage['purchase_volume'] !== null && scope.new_beverage['purchase_volume'] !== '' && MathService.numIsInvalid(scope.new_beverage['purchase_volume']) )
        {
          scope.form_ver.error_pvolume=true;
          all_clear = false;
        }

        // if purchase unit is not empty but purchase volume is empty, that's a volume error
        if ( scope.new_beverage['purchase_unit'] !== null && (scope.new_beverage['purchase_volume'] === null || scope.new_beverage['purchase_volume'] === '') ) {
          scope.form_ver.error_pvolume=true;
          all_clear=false;
        }

        scope.form_ver.error_punit=false;
        // if purchase volume is not empty but no unit, that's a unit error
        if ( (scope.new_beverage['purchase_volume'] !== null && scope.new_beverage['purchase_volume'] !== '') && scope.new_beverage['purchase_unit']===null ) {
          scope.form_ver.error_punit=true;
          all_clear=false;
        }

        if (scope.new_beverage['purchase_cost'] === null || scope.new_beverage['purchase_cost'] === '' || MathService.numIsInvalid(scope.new_beverage['purchase_cost']) )
        {
          scope.form_ver.error_pcost=true;
          all_clear = false;
        } else {
          scope.form_ver.error_pcost=false;
        }

        if ( scope.new_beverage['purchase_count'] === null || MathService.numIsInvalid(scope.new_beverage['purchase_count']) )
        {
          scope.form_ver.error_pcount=true;
          all_clear = false;
        } else {
          scope.form_ver.error_pcount=false;
        }

        if (scope.new_unit_sale.value !== null && scope.new_unit_sale.value !== '' && MathService.numIsInvalid(scope.new_unit_sale.value) )
        {
          scope.form_ver.error_unit_sale=true;
          all_clear=false;
        } else {
          scope.form_ver.error_unit_sale=false;
        }

        // Collect the final list of size prices.  Careful to do the following:
        // 1. If serve_type is multi and volume and price both null, discard
        // 2. If serve_type is single, discard any size_prices not of Unit type
        var final_size_prices = []
        for (var sale_i in scope.new_beverage['size_prices'])
        {
          var sale = scope.new_beverage['size_prices'][sale_i];
          var serve_type = scope.new_beverage['serve_type'];
          // if multi and both volume and price null, is empty entry; discard
          if (serve_type === scope.serve_types[2] && sale['price'] === null && sale['volume'] === null && sale['unit'] === null) {
            continue;
          }
          // if single and not Unit entry, discard
          if (serve_type === scope.serve_types[1] && sale['unit'] !== 'Unit') {
            continue;
          }
          final_size_prices.push(sale);
        }

        for (var sale_i in final_size_prices)
        {
          scope.form_ver.errors_sale_volume[sale_i] = false;
          scope.form_ver.errors_sale_price[sale_i] = false;

          var sale = final_size_prices[sale_i];
          
          if ( (sale.volume === null || sale.volume === '') && sale.unit===null ) {
            // missing volume AND unit
            scope.form_ver.errors_sale_volume[sale_i] = true;
            all_clear = false;
          } else if (sale.volume !== null && sale.volume !== '' && MathService.numIsInvalid(sale.volume) ) {
            // sale volume NaN
            scope.form_ver.errors_sale_volume[sale_i] = true;
            all_clear = false;
          } else if ( (sale.volume !== null && sale.volume !== '') && sale.unit === null ) {
            // sale volume is missing a sale unit
            scope.form_ver.errors_sale_volume[sale_i] = true;
            all_clear = false;
          } else if ( sale.unit !== null && (sale.volume === null || sale.volume === '' ) ) {
            // sale unit is missing a sale volume
            scope.form_ver.errors_sale_volume[sale_i] = true;
            all_clear = false;
          }
          if (sale.price !== null && sale.price !== '' && MathService.numIsInvalid(sale.price)) {
            // sale price NaN
            scope.form_ver.errors_sale_price[sale_i] = true;
            all_clear = false;
          }
        }

        scope.new_beverage['size_prices'] = final_size_prices;

        if (!all_clear) {
          scope.new_failure_msg = "Whoops!  Some fields are missing or incorrect, please fix them and try again.  If you don't know the numeric value for a field, set it to '0'.";
          // if ended up with size_prices having length 0, if not single serve, push null row
          if (scope.new_beverage['size_prices'].length === 0) {
            scope.new_beverage['size_prices'] = [{volume:null, unit:null, price:null}];
          }
          return;
        }

        // the unit sale is a special entry we need to push into size_prices,
        // with volume 1, unit "Unit", and price of new_unit_sale.  Note we do this
        // after there are no form validation errors and are ready to commit.
        //
        // Should always add for single serve
        if (scope.new_beverage['serve_type'] === scope.serve_types[1] || scope.new_beverage['container_type'] !== "Keg") {
          // unshift places the entry at head of array
          scope.new_beverage['size_prices'].unshift({'volume':1, 'unit':'Unit', 'price':scope.new_unit_sale.value})
        }

        // check if item is already in scope.inventory_items
        /*
        for (var item_i in scope.inventory_items) {
          var existing = scope.inventory_items[item_i];
          if (existing.name == item)
          {
            console.log(item + ' is already in inventory!');
            // XXX Change this to red text on page instead of alert
            alert(item + ' is already in inventory!');
            return;
          }
        }
        */

        // Need to convert serve_type back to an int
        // Need to convert beverage.serve_type, which is an int, to a string
        // first, cache value so after we save, restore for clearing new form
        var restore_serve_type = scope.new_beverage.serve_type;
        if (scope.new_beverage.serve_type === scope.serve_types[1]) {
          scope.new_beverage.serve_type = 0;
        } else {
          scope.new_beverage.serve_type = 1;
        }

        if (!scope.is_edit) {
          // If this is a NEW beverage, just post it
          var result = BeveragesService.post(scope.new_beverage);
          result.then(
          function(payload) {
            scope.new_success_msg = scope.new_beverage['product'] + " has been added to your Beverages!";

            if (scope.closeOnSave !== null) {
              // returning an object with key new_beverage allows us to
              // pass the controller the new beverage from this directive!
              scope.closeOnSave( {new_beverage:payload.data} );
            }

            if (scope.internalControl !== null)
            {
              scope.internalControl.clearNewForm();
            }
            scope.new_beverage.serve_type = restore_serve_type;

          },
          function(errorPayload) {
            ; // do nothing for now
          });
        } else {
          // If this is an EDIT operation
          // Find any diffs between the original and the modified object.
          // Instead of doing a comprehensive generic comparison, we rely on
          // knowing the beverage object's structure to do comparisons (e.g.,
          // the fact that size_prices is an array of objects)
          var changedKeys = [];     // store which keys changed
          for (var key in scope.new_beverage) {
            if (scope.editBeverage.hasOwnProperty(key)) {
              if (key === '__proto__' || key === '$$hashKey') {
                continue;
              } else if (key==='distributor' || key==='keg') {
                // we ignore these 2 objects, which are only for client-side
                // convenience
                continue;
              }
              // handle known special cases such as size_prices
              else if (key==='size_prices') {
                var osp = scope.editBeverage.size_prices;
                var sp = scope.new_beverage.size_prices;
                if ( (osp===null && sp!==null) || (osp!==null&&sp===null) ) {
                  changedKeys.push(key);
                  continue;
                }
                console.log("1");
                if (scope.editBeverage.size_prices.length !== scope.new_beverage.size_prices.length)
                {
                  changedKeys.push(key);
                  continue;
                }
                console.log("2");
                console.log(scope.editBeverage);
                console.log(scope.new_beverage);
                for (var i in scope.editBeverage.size_prices) {
                  var osp = scope.editBeverage.size_prices[i]
                  var sp = scope.new_beverage.size_prices[i];
                  if (osp.price != sp.price || osp.unit != sp.unit || osp.volume != sp.volume) {
                    changedKeys.push(key);
                    continue;
                  }
                }
              }
              else if (scope.editBeverage[key] !== scope.new_beverage[key]) {
                changedKeys.push(key);
              }
            }
          }
          if (changedKeys.length == 0) {
            // there were no changes made, so call closeOnCancel and quit.
            if (scope.closeOnCancel !== null) {
              scope.closeOnCancel();
            }
            return;
          }

          // now put the values of the *changed* keys to the server
          var putObj = {};
          for (var i in changedKeys) {
            var key = changedKeys[i];
            putObj[key] = scope.new_beverage[key];
          }
          putObj.id = scope.new_beverage.id;

          var result = BeveragesService.put(putObj, changedKeys);
          result.then(
          function(payload) {
            var new_bev_id = payload.data['id'];
            scope.new_beverage.id = new_bev_id;

            if (scope.closeOnSave !== null) {
              // returning an object with key new_distributor allows us to
              // pass the controller the new distributor from this directive!
              scope.closeOnSave( {new_beverage:scope.new_beverage} );
            }

            if (scope.internalControl !== null)
            {
              scope.internalControl.clearNewForm();
            }

          },
          function(errorPayload) {
            ; // do nothing for now
          });
        }

      };

      scope.addNewKeg = function() {
        var modalNewInstance = $modal.open({
          templateUrl: 'newKegModal.html',
          controller: 'newKegModalCtrl',
          windowClass: 'new-dist-modal',
          backdropClass: 'green-modal-backdrop',
          resolve: {
            distributor: function() {
              return scope.new_beverage.distributor;
            }
          }
        });

        modalNewInstance.result.then(
          function(result) {
            var status = result[0];
            var new_keg = result[1];
            if (status === 'save') {
              scope.new_beverage.keg = new_keg;
              scope.new_beverage.keg_id = new_keg.id;
            }
          },
          // error status
          function() {
            ;
          });
      };

      scope.addNewDistributor = function() {
        var modalNewInstance = $modal.open({
          templateUrl: 'newDistModal.html',
          controller: 'newDistModalCtrl',
          windowClass: 'new-dist-modal',
          backdropClass: 'green-modal-backdrop',
          resolve: {
            all_distributors: function() {
              return scope.allDistributors;
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
            scope.new_beverage.distributor = new_dist;
            scope.new_beverage.distributor_id = new_dist.id;
          }, 
          // error status
          function() {
            ;
          });
      };

    }
  }
})

.controller('newDistModalCtrl', function($scope, $modalInstance, DistributorsService, all_distributors) {

  $scope.distributors = all_distributors;

  // When the New Distributor directive closes, it should call closeOnSave
  $scope.closeOnSave = function(new_distributor) {

    //console.log('CLOSE ON SAVE');
    //console.log(new_distributor);

    // fix new_distributor.kegs to match client side kegs structure
    if (new_distributor.kegs === null) {
      new_distributor.kegs = [];
    }
    for (var i in new_distributor.kegs) {
      var keg = new_distributor.kegs[i];
      var formatted = MathService.fixFloat2(keg.volume) + " " + keg.unit;
      if (keg.deposit !== null) {
        formatted += " ($" + MathService.fixFloat2(keg.deposit) + " deposit)";
      }
      new_distributor.kegs[i]['formatted'] = formatted;
    }

    $scope.distributors.push(new_distributor);
    $scope.distributors.sort( function(a, b) {
      var nameA = a['name'];
      var nameB = b['name'];
      return nameA.localeCompare(nameB);
    });

    console.log($scope.distributors);

    $modalInstance.close(['save', new_distributor]);
  };

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

})


.controller('newKegModalCtrl', function($scope, $modalInstance, DistributorsService, MathService, distributor) {

  $scope.distributor = distributor;

  $scope.cancel = function() {
    $modalInstance.dismiss('cancel');
  };

  $scope.closeOnSave = function(new_keg) {

    // fix decimal points for keg volumes to 2
    if ( new_keg.deposit !== undefined && new_keg.deposit !== null ) {
      new_keg.deposit = MathService.fixFloat2(new_keg.deposit);
    }
    if ( new_keg.volume !== undefined && new_keg.volume !== null ) {
      new_keg.volume = MathService.fixFloat2(new_keg.volume);
    }

    var formatted = new_keg.volume + " " + new_keg.unit;
    if (new_keg.deposit !== null) {
      formatted += " ($" + new_keg.deposit + " deposit)";
    }
    new_keg['formatted'] = formatted;

    $scope.distributor.kegs.push(new_keg);

    $modalInstance.close(['save', new_keg]);
  };


})

;