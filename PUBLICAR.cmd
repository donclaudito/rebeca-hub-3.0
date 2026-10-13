@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================================
echo   Rebeca Hub 3.0 - publicar na Base44
echo ============================================================
echo.
echo  1) Vai pedir para entrar na Base44 (a primeira vez).
echo     Aparece um codigo e um link: abra o link, escreva o
echo     codigo e confirme. Entre com a conta DONA do app
echo     "Rebeca Hub 3.0".
echo.
echo  2) Depois publica o site sozinho.
echo.
echo  Se ja tiver sessao, o passo 1 passa a correr.
echo.
pause

echo.
echo --- Passo 1: entrar ---
call npx base44 login
if errorlevel 1 (
  echo.
  echo X Falhou o login. Volte a correr este ficheiro e confirme o codigo
  echo   dentro do prazo ^(expira em poucos minutos^).
  pause
  exit /b 1
)

echo.
echo --- Passo 2: publicar ---
call npx base44 deploy --build --yes
if errorlevel 1 (
  echo.
  echo X O deploy falhou. Copie a mensagem de erro acima.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   PUBLICADO. Abra: https://rebeca-hub-30-0aecdc9b.base44.app
echo ============================================================
echo.
echo  Confirme que o canto superior direito diz "video v3.4.0".
pause
