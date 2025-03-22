# Configuración de GitHub para MCP Vector Sync

Este documento detalla los pasos necesarios para configurar un repositorio en GitHub y subir el proyecto MCP Vector Sync.

## Requisitos previos

1. **Cuenta de GitHub**: Necesitas tener una cuenta en [GitHub](https://github.com/). Si no tienes una, puedes crear una cuenta gratuita.
2. **Git instalado**: Asegúrate de tener Git instalado en tu máquina. Puedes verificarlo con:
   ```bash
   git --version
   ```
   Si no está instalado, puedes descargarlo desde [git-scm.com](https://git-scm.com/).

## Paso 1: Crear un nuevo repositorio en GitHub

1. Inicia sesión en tu cuenta de GitHub
2. Haz clic en el botón "+" en la esquina superior derecha y selecciona "New repository"
3. Completa la información del repositorio:
   - **Repository name**: `mcp-vector-sync` (o el nombre que prefieras)
   - **Description**: "Servicio MCP para sincronización de vectores multi-tenant con Supabase"
   - **Visibility**: Puedes elegir "Public" o "Private" según tus necesidades
   - **Initialize this repository with**: No selecciones ninguna opción (lo inicializaremos desde local)
4. Haz clic en "Create repository"

## Paso 2: Preparar el proyecto local

1. Asegúrate de que el archivo `.gitignore` incluya todos los archivos que no deben subirse:
   ```
   node_modules/
   dist/
   .env
   .env.*
   logs/
   *.log
   .DS_Store
   ```

2. Verifica que no haya información sensible en ningún archivo que se vaya a subir:
   - Revisa que no haya API keys en el código
   - Asegúrate de que el archivo `.env` esté en `.gitignore`
   - Verifica que no haya tokens o credenciales en los archivos de configuración

## Paso 3: Inicializar Git y subir el proyecto

Desde la terminal, navega a la carpeta del proyecto y ejecuta los siguientes comandos:

```bash
# Navegar a la carpeta del proyecto (si no estás ya en ella)
cd MCP/MCP_Vector_Sync

# Inicializar un repositorio Git local
git init

# Agregar todos los archivos al staging
git add .

# Crear el primer commit
git commit -m "Initial commit: MCP Vector Sync service"

# Agregar el repositorio remoto (reemplaza 'tu-usuario' con tu nombre de usuario de GitHub)
git remote add origin https://github.com/tu-usuario/mcp-vector-sync.git

# Subir el código al repositorio remoto
git push -u origin main
```

Si estás usando la rama `master` en lugar de `main`, reemplaza `main` por `master` en el último comando.

## Paso 4: Verificar la subida

1. Refresca la página de tu repositorio en GitHub
2. Deberías ver todos los archivos del proyecto subidos correctamente
3. Verifica que los archivos sensibles (como `.env`) no se hayan subido

## Paso 5: Configurar protección de ramas (opcional pero recomendado)

Para proyectos en producción, es recomendable proteger la rama principal:

1. Ve a la pestaña "Settings" de tu repositorio
2. Navega a "Branches" en el menú lateral
3. En "Branch protection rules", haz clic en "Add rule"
4. En "Branch name pattern", escribe `main` (o `master` si usas esa rama)
5. Selecciona las opciones de protección que desees, como:
   - "Require pull request reviews before merging"
   - "Require status checks to pass before merging"
   - "Include administrators"
6. Haz clic en "Create" o "Save changes"

## Paso 6: Configurar GitHub Actions para CI/CD (opcional)

Si deseas configurar integración continua, puedes crear un archivo de GitHub Actions:

1. Crea una carpeta `.github/workflows` en la raíz del proyecto
2. Crea un archivo `ci.yml` dentro de esa carpeta con el siguiente contenido:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build
      run: npm run build
    
    - name: Lint
      run: npm run lint
    
    - name: Test
      run: npm test
```

## Conexión con Railway

Una vez que el repositorio esté en GitHub, podrás conectarlo fácilmente con Railway:

1. Inicia sesión en [Railway](https://railway.app/)
2. Crea un nuevo proyecto
3. Selecciona "Deploy from GitHub repo"
4. Autoriza a Railway para acceder a tus repositorios si es necesario
5. Selecciona el repositorio `mcp-vector-sync`
6. Railway detectará automáticamente el Dockerfile y lo usará para el despliegue

## Notas adicionales

- **Tokens de acceso personal**: Si tienes problemas para autenticarte con GitHub, es posible que necesites crear un token de acceso personal:
  1. Ve a "Settings" > "Developer settings" > "Personal access tokens" > "Tokens (classic)"
  2. Haz clic en "Generate new token"
  3. Selecciona los permisos necesarios (al menos "repo")
  4. Usa este token en lugar de tu contraseña cuando Git te pida credenciales

- **SSH en lugar de HTTPS**: Si prefieres usar SSH en lugar de HTTPS para conectarte a GitHub:
  1. Genera una clave SSH si no tienes una: `ssh-keygen -t ed25519 -C "tu-email@ejemplo.com"`
  2. Agrega la clave a tu agente SSH: `ssh-add ~/.ssh/id_ed25519`
  3. Agrega la clave pública a tu cuenta de GitHub
  4. Usa la URL SSH para el repositorio: `git remote add origin git@github.com:tu-usuario/mcp-vector-sync.git`