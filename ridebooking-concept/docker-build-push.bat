@echo off
:: Usage: docker-build-push.bat [tag]
:: Example: docker-build-push.bat v1.2.0
:: Defaults to "latest" if no tag given.

set IMAGE=haoyuuxx/biyahero-app
if "%~1"=="" (set TAG=latest) else (set TAG=%~1)

echo Building dist...
call npm run build
if errorlevel 1 goto :error

echo Building image %IMAGE%:%TAG%...
docker build -t %IMAGE%:%TAG% .
if errorlevel 1 goto :error

if not "%TAG%"=="latest" (
  docker tag %IMAGE%:%TAG% %IMAGE%:latest
  if errorlevel 1 goto :error
)

echo Pushing to Docker Hub...
docker push %IMAGE%:%TAG%
if errorlevel 1 goto :error

if not "%TAG%"=="latest" (
  docker push %IMAGE%:latest
  if errorlevel 1 goto :error
)

echo.
echo Done. Deploy on server with:
echo   docker compose pull ^&^& docker compose up -d
goto :end

:error
echo.
echo Build/push failed. Check errors above.
exit /b 1

:end
