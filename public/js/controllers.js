var controllers = angular.module('controllers', []);

controllers.controller('AccountCtrl', function ($rootScope, $scope, $routeParams, $http) {
    $rootScope.slimHeader = true;

    var setView = function (view) {
        $scope.list_view        = view === 'list' || !view;
        $scope.big_list_view    = view === 'big-list';
        $scope.tile_view        = view === 'tile';
    }

    $rootScope.$watch('session', function (newValue, oldValue) {
        if (!newValue.authenticated) {
            $scope.read_only = true;
        }
    }, true);

    $http.get('/api/profile/' + $routeParams.userid).success(function (data) {
        $http.get('/api/permissions/edit/' + $routeParams.userid).success(function (permissions) {
            $scope.user         = data.user;
            $scope.player       = data.player;
            $scope.library      = data.library;
            $scope.read_only    = !permissions.hasPermission;

            setView($rootScope.session.view);

            setTimeout(function () { 
                $scope.$apply(function () {
                    $scope.loaded = true;
                });
            }, 1000);
        });
    });

    $scope.completeGame = function ($event, game) {
        if ($event.originalEvent.target.tagName !== 'INPUT') {
            if (!$scope.read_only) {
                game.completed = !game.completed;
                if (game.completed) {
                    $http.post('/api/profile/games/' + game.appid);
                }
                else {
                    $http.delete('/api/profile/games/' + game.appid);
                }
            }
        }
    }

    $scope.changeView = function (view) {
        $scope.loaded = false;
        $http.put('/api/session/view/' + view).success(function () {
            setView(view);

            setTimeout(function () { 
                $scope.$apply(function () {
                    $scope.loaded = true;
                });
            }, 1000);
        });
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