var controllers = angular.module('controllers', []);

controllers.controller('AccountCtrl', function ($rootScope, $scope, $http) {
    $rootScope.slimHeader = true;
});

controllers.controller('HomeCtrl', function ($rootScope, $scope, $http) {
    $rootScope.slimHeader = false;

    $http.get('/api/summary/latest').success(function (data) {
        $scope.latest = data;
    });

    $http.get('/api/summary/top').success(function (data) {
        $scope.most = data;
    });
});