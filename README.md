# inventario_querendona con PostgreSQL

Sistema de inventario con login, roles, API en Node/Express y base de datos PostgreSQL.

## Requisitos

- Node.js
- PostgreSQL

## Configuracion

1. Crea la base de datos:

```sql
CREATE DATABASE inventario_querendona;
```

2. Copia `.env.example` como `.env` y ajusta tu conexion:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/inventario_querendona
```

3. Instala dependencias:

```bash
npm install
```

4. Inicia el servidor:

```bash
npm start
```

5. Abre:

```text
http://localhost:3000/login.html
```

## Usuarios demo

- Administradores: `admin`, `admin2`, `admin3` con contrasena `admin123`.
- Cocineros: `cocinero`, `cocinero2`, `cocinero3`, `cocinero4`, `cocinero5`, `cocinero6` con contrasena `alta123`.

## Base de datos

El servidor crea automaticamente las tablas si no existen y carga datos demo cuando la tabla de productos esta vacia. El archivo `schema.sql` tambien contiene el esquema por si prefieres ejecutarlo manualmente.

La tabla que lee el sistema es `products`. Para separar productos usa `category` y `subcategory`, por ejemplo `Bebidas / Refrescos`, `Bebidas / Alcohol`, `Cocina / Carne`, `Cocina / Lacteos` o `Cocina / Verdura`.

Campos principales:

```text
name          nombre del producto
stock         cantidad actual
min_stock     cantidad minima para activar alerta
description   descripcion corta
category      categoria
subcategory   subcategoria
price         precio
```

Si ya tienes tablas separadas por categoria, revisa `import_category_tables.sql` como plantilla para pasar esos datos a `products`.

Los avisos que envian los usuarios cuando falta un producto se guardan en `stock_alerts`. El admin puede verlos y marcarlos como atendidos desde el panel.

## Entradas y compras

El menu de `Entradas` permite registrar compras por producto existente con proveedor, cantidad recibida, costo unitario y nota. Al guardar una compra, el sistema aumenta el stock, actualiza el costo y proveedor de referencia del producto, y registra el movimiento como entrada.

Tambien se puede consultar el historial de compras por rango de fechas y descargarlo en Excel con totales por proveedor y categoria.

## Historial detallado y utilidad

Cada movimiento guarda tipo, costo unitario y precio unitario cuando aplica. Los tipos incluyen alta, entrada, compra, reposicion, uso en cocina, ajuste, merma, producto danado, consumo interno y eliminacion. Desde `Productos`, el admin puede usar `Uso` para registrar insumos utilizados, mermas, productos danados o consumo interno con nota.

El menu de `Utilidad` calcula ingreso estimado, costo estimado, ganancia estimada, margen y utilidad por producto con base en los movimientos de venta. Tambien permite descargar el reporte en Excel.

## Alertas inteligentes y subcategorias

El panel principal muestra alertas automaticas para:

- productos agotados
- productos bajo minimo
- productos sin movimiento durante varios dias
- productos con consumo rapido
- productos proximos a acabarse segun su ritmo de salida

Puedes ajustar estos limites en `.env`:

```env
SMART_ALERT_NO_MOVEMENT_DAYS=14
SMART_ALERT_DEPLETION_DAYS=7
```

En `Productos` puedes filtrar por categoria y subcategoria. Los reportes y Excel muestran la ruta completa de categoria/subcategoria para que sea mas facil analizar compras, usos de insumos, ingresos y utilidad.

## Reporte de ingresos

El panel de `Reportes` permite consultar el valor de los insumos usados por rango de fechas y descargar un archivo Excel. El sistema considera los usos registrados con el boton rapido (`-`) o desde `Uso de insumos`, porque representan unidades descontadas del inventario de cocina.

Para movimientos nuevos, el sistema guarda el precio unitario al momento de la salida. Para movimientos antiguos que no tengan precio guardado, el reporte usa el precio actual del producto como respaldo.

El menu de `Salidas` muestra exclusivamente los movimientos negativos de productos por rango de fechas. Desde ahi se puede revisar la tabla en pantalla y descargar el Excel de uso de insumos con cantidad utilizada, precio unitario, total, motivo y usuario que hizo el movimiento.

El menu de `Comparativa` cruza entradas contra salidas por producto. Muestra unidades compradas, unidades utilizadas, saldo del periodo, gasto estimado de lo utilizado y el stock actual que quedo despues de los movimientos registrados.

## Avisos por correo y WhatsApp

Cuando un usuario usa `Avisar agotado`, el sistema guarda el aviso y puede mandar una notificacion externa con:

```text
fecha y hora
producto
SKU
categoria
subcategoria
cantidad actual
usuario que reporto
mensaje escrito por el usuario
```

Para correo, configura un servidor SMTP en `.env`:

```env
SMTP_HOST=smtp.tuservidor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario
SMTP_PASS=contrasena
ALERT_EMAIL_FROM=inventario@tudominio.com
ALERT_EMAIL_TO=admin@tudominio.com
```

Para WhatsApp, configura WhatsApp Cloud API:

```env
WHATSAPP_API_VERSION=v20.0
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_ACCESS_TOKEN=tu_token
ALERT_WHATSAPP_TO=5217711234567
WHATSAPP_TEMPLATE_NAME=aviso_producto_agotado
WHATSAPP_TEMPLATE_LANGUAGE=es
WHATSAPP_TEMPLATE_HEADER_IMAGE_ID=
WHATSAPP_TEMPLATE_HEADER_IMAGE_URL=
```

La plantilla de WhatsApp debe estar aprobada con cuatro variables en este orden:

```text
{{1}} producto
{{2}} categoria
{{3}} fecha y hora
{{4}} usuario que reporto
```

Si alguna configuracion no esta completa, el sistema no detiene el aviso: lo guarda en la base de datos y omite ese canal.

Si la plantilla tiene encabezado de imagen, configura una de estas dos opciones:

```text
WHATSAPP_TEMPLATE_HEADER_IMAGE_ID    id de media subido a WhatsApp Cloud API
WHATSAPP_TEMPLATE_HEADER_IMAGE_URL   URL publica https de la imagen
```

## Avisos de salidas pendientes por turno

El servidor puede avisar a los administradores cuando un cocinero no ha registrado ninguna salida durante su turno. Usa los mismos destinatarios de administradores configurados en `ALERT_EMAIL_TO` y `ALERT_WHATSAPP_TO`.

Por defecto maneja dos turnos:

```text
Turno 1: 09:00 a 15:00, avisa desde las 14:00 cada 20 minutos
Turno 2: 15:00 a 21:00, avisa desde las 20:00 cada 20 minutos
```

Cada turno manda como maximo 4 recordatorios. Si el cocinero registra una salida despues de aparecer como pendiente, se manda un aviso de cierre a los administradores y ya no se le incluye en recordatorios de ese turno.

Configuracion opcional en `.env`:

```env
SHIFT_EXIT_ALERTS_ENABLED=true
SHIFT_EXIT_ALERT_INTERVAL_MINUTES=20
SHIFT_EXIT_ALERT_MAX_RUNS=4
SHIFT_EXIT_ALERT_CHECK_SECONDS=60
SHIFT_1_START=09:00
SHIFT_1_END=15:00
SHIFT_1_ALERT_FROM=14:00
SHIFT_2_START=15:00
SHIFT_2_END=21:00
SHIFT_2_ALERT_FROM=20:00
SHIFT_ALERT_WHATSAPP_TEMPLATE_NAME=aviso_salida_pendiente
SHIFT_ALERT_WHATSAPP_TEMPLATE_LANGUAGE=es
SHIFT_COMPLETION_WHATSAPP_TEMPLATE_NAME=aviso_salida_realizada
SHIFT_COMPLETION_WHATSAPP_TEMPLATE_LANGUAGE=es
```

La plantilla de WhatsApp para los recordatorios debe estar aprobada con cuatro variables:

```text
{{1}} turno
{{2}} horario del turno
{{3}} fecha y hora
{{4}} cocineros sin salida registrada
```

Tambien se envia un aviso de cierre cuando el cocinero registra una salida despues de haber aparecido como pendiente. Esa plantilla debe llamarse `aviso_salida_realizada` y usar:

```text
{{1}} cocinero
{{2}} turno
{{3}} horario del turno
{{4}} fecha y hora
```
