angular.module('myApp')

.factory("DistributorsService", function($http, MathService) {

  return {
    get: function() {
      //var promise = $http.get('/distributors');
      //return promise;

      
      var promise = new Promise(
        function(resolve, reject) {
          var result = $http.get('/distributors');
          result.then(
          function(payload) {
            var data = payload.data;
            
            var all_distributors = data;
            //console.log(data);

            // go through all kegs in all distributors and add a 'formatted'
            // attribute for displaying volume, unit, and deposit
            for (var i in all_distributors) {
              if (all_distributors[i].kegs===null) {
                all_distributors[i].kegs = [];
              }

              for (var j in all_distributors[i].kegs) {
                var keg = all_distributors[i].kegs[j];

                // fix decimal points for keg volumes to 2
                if ( keg.deposit !== undefined && keg.deposit !== null ) {
                  keg.deposit = MathService.fixFloat2(keg.deposit);
                }
                if ( keg.volume !== undefined && keg.volume !== null ) {
                  keg.volume = MathService.fixFloat2(keg.volume);
                }

                var formatted = keg.volume + " " + keg.unit;
                if (keg.deposit !== null) {
                  formatted += " ($" + keg.deposit + " deposit)";
                }
                all_distributors[i].kegs[j]['formatted'] = formatted;
              }

              // sort kegs by volume
              all_distributors[i].kegs.sort(function(a, b) {
                if (a.volume < b.volume) return -1;
                return 1;
              });

            }

            // sort distributors by name
            all_distributors.sort(function(a, b) {
              if (a.name < b.name) return -1;
              return 1;
            });

            resolve({data:all_distributors});

          },
          function(errorPayload) {
            ; // do nothing for now
            reject();
          });
        });

      return promise;
      
    },

    post: function(new_distributor) {
      var promise = $http.post('/distributors', {
        name:new_distributor['name'],
        contact_name:new_distributor['contact_name'],
        email:new_distributor['email'],
        phone:new_distributor['phone'],
        kegs:new_distributor['kegs']
      });

      return promise;
    },
    put: function(edit_distributor, change_keys) {
      var promise = $http.put('/distributors', {
        distributor:edit_distributor,
        change_keys:change_keys
      });

      return promise;
    }
  };

})

.factory("KegsService", function($http) {

  return {

    post: function(dist_id, new_keg) {
      var promise = $http.post('/kegs', {
        distributor_id: dist_id,
        volume:new_keg.volume,
        unit:new_keg.unit,
        deposit:new_keg.deposit
      });

      return promise;
    }
  };

});

