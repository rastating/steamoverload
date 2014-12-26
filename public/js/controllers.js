var controllers = angular.module('controllers', []);

controllers.controller('AccountCtrl', function ($rootScope, $scope, $routeParams, $http) {
    $rootScope.slimHeader = true;

    $scope.$on('$viewContentLoaded', function () {
        console.log('$viewContentLoaded');
    });

    $http.get('/api/profile/' + $routeParams.userid).success(function (data) {
        $http.get('/api/permissions/edit/' + $routeParams.userid).success(function (permissions) {
            $scope.user = data.user;
            $scope.player = data.player;
            $scope.library = data.library;
            $scope.list_view = data.list_view;
            $scope.big_list_view = data.big_list_view;
            $scope.tile_view = data.tile_view;
            $scope.read_only = !permissions.hasPermission;

            setTimeout(function () { 
                $scope.$apply(function () {
                    $scope.loaded = true;
                });
            }, 1000);
        });
    });

    $scope.completeGame = function ($event, game) {
        if ($event.originalEvent.target.tagName !== 'INPUT') {
            game.completed = !game.completed;
        }
    }
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