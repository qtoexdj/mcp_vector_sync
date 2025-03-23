-- Verificar y crear la extensión http si no existe
CREATE EXTENSION IF NOT EXISTS http;

-- Función que enviará webhooks cuando los proyectos cambien
CREATE OR REPLACE FUNCTION notify_project_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Enviar webhook HTTP POST al MCP Vector Sync
  PERFORM http_post(
    'https://mcpvectorsync-production.up.railway.app/webhook/project-update',
    json_build_object(
      'inmobiliaria_id', NEW.inmobiliaria_id,
      'project_id', NEW.id,
      'event', TG_OP,
      'timestamp', now()
    )::text,
    'application/json'
  );
  
  -- Intentar registrar el evento en logs, pero continuar si falla
  BEGIN
    INSERT INTO webhook_logs (
      tabla, 
      operacion, 
      registro_id, 
      tiempo,
      estado
    ) VALUES (
      'proyectos', 
      TG_OP, 
      NEW.id, 
      now(), 
      'enviado'
    );
  EXCEPTION 
    WHEN insufficient_privilege THEN
      -- Ignorar error de permisos y continuar
      NULL;
    WHEN undefined_table THEN
      -- Ignorar si la tabla no existe y continuar
      NULL;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar el trigger si ya existe
DROP TRIGGER IF EXISTS projects_change_trigger ON proyectos;

-- Crear trigger para INSERT o UPDATE en la tabla proyectos
CREATE TRIGGER projects_change_trigger
AFTER INSERT OR UPDATE ON proyectos
FOR EACH ROW
EXECUTE FUNCTION notify_project_change();

-- Tabla opcional para registrar los webhooks enviados (para debugging)
-- Solo crear si tienes permisos de administrador
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles 
    WHERE rolname = CURRENT_USER 
    AND rolsuper = true
  ) THEN
    -- Crear tabla de logs
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id SERIAL PRIMARY KEY,
      tabla TEXT NOT NULL,
      operacion TEXT NOT NULL,
      registro_id UUID NOT NULL,
      tiempo TIMESTAMPTZ NOT NULL,
      estado TEXT NOT NULL,
      respuesta JSONB
    );

    -- Crear índice para mejorar consultas
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_registro_id ON webhook_logs(registro_id);

    -- Otorgar permisos necesarios
    GRANT INSERT ON webhook_logs TO authenticated;
    GRANT INSERT ON webhook_logs TO service_role;
    GRANT USAGE ON SEQUENCE webhook_logs_id_seq TO authenticated;
    GRANT USAGE ON SEQUENCE webhook_logs_id_seq TO service_role;
  END IF;
END $$;