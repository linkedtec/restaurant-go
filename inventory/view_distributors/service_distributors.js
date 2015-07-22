angular.module('myApp')

.factory("DistributorsService", function($http) {

  return {
    get: function() {
      var promise = $http.get('/distributors');
      return promise;
    },

    post: function(new_distributor) {
      var promise = $http.post('/distributors', {
        name:new_distributor['name'],
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

