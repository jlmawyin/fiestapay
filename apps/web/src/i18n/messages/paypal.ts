import { defineCatalog } from '../catalog';

/**
 * PayPal section texts only. The SDK URL, parameters, and the order flow are
 * untouched. The verify, capture-complete, and compact "open" controls render
 * UI_LABELS verifyCapture, captureComplete, and openPayPal literally at the
 * call site. Spanish stays byte-identical.
 */
export const paypalCatalog = defineCatalog({
  es: {
    verifyingCapture: 'Verificando captura con el servidor...',
    captureConfirmed: '¡Pago capturado y confirmado con éxito!',
    captureUnconfirmed:
      'El servidor aún no confirma el pago. Puedes reintentar con Verificar. No se marcó como pagado.',
    manualError: 'No se pudo confirmar la captura en este momento',
    sdkError: 'Error al capturar la orden en el servidor',
    externalArmed:
      'Completa el pago en PayPal. Al volver a esta pestaña comprobaremos la orden con el servidor. No se marca como pagada hasta que el servidor lo confirme.',
    checkingServer: 'Comprobando el pago con el servidor…',
    orderStatusShown: (status: string) => `La orden figura como "${status}". No se marcó como pagada.`,
    autoConfirmFail:
      'No confirmamos el pago automáticamente. Usa Verificar para reintentar. Nada se marcó como pagado.',
    stillWaiting: 'PayPal aún no confirma la aprobación. Seguimos comprobando…',
    backgroundPaused:
      'Esta pestaña está en segundo plano. Seguiremos comprobando al volver. Nada se marcó como pagado.',
    reconcileFail:
      'No pudimos consultar la orden. Puedes reintentar con Verificar. No se marcó como pagado.',
    cancelFlow:
      'El flujo en PayPal fue cancelado o pausado. Si autorizaste el pago en ventana externa, puedes verificar el estado de la orden.',
    paypalIssue: (detail: string) =>
      `Incidencia en PayPal: ${detail}. Puedes consultar el estado de tu orden para comprobar si fue recibida por el servidor.`,
    renderFail: (detail: string) => `No se pudo cargar el botón de PayPal: ${detail}`,
    sdkLoadFail: (detail: string) => `Error cargando PayPal SDK: ${detail}`,
    transactionFallback: 'La transacción no pudo completarse',
    renderFallback: 'error de render',
    scriptFallback: 'error de script',
    verifyBusy: 'Verificando...',
    heading: 'Completar Pago Seguro',
    orderBadge: (shortId: string) => `Orden #${shortId}`,
    approvedTitle: '✓ Autorización recibida en PayPal',
    approvedBody:
      'Tu orden está autorizada en PayPal. Confirma la captura final para que el servidor verifique la transacción y acredite tu cuota.',
    approvedBusy: 'Verificando y Capturando...',
    noProviderTitle: 'Proveedor PayPal no configurado en el servidor',
    noProviderBody:
      'El servidor reporta que las credenciales de PayPal Sandbox están ausentes. Los botones de pago directo no se pueden inicializar en este entorno sin configurar ',
    secureNote:
      'Paga de forma segura mediante PayPal Sandbox. El pago solo se considerará completado una vez que nuestro servidor capture y verifique la transacción.',
    loadingSdk: 'Cargando interfaz oficial de PayPal Sandbox...',
    sdkFallback: 'No se pudo inicializar la pasarela de PayPal.',
    retrySdk: 'Reintentar carga de PayPal',
    externalApprovalLink: 'Abrir enlace de aprobación PayPal provisto por la orden ↗',
    externalWindowLink: 'Ir a pagar en PayPal en ventana externa ↗',
    reconcileHint: '¿Pagaste en otra ventana o necesitas conciliar?',
  },
  en: {
    verifyingCapture: 'Checking the capture with the server...',
    captureConfirmed: 'Payment captured and confirmed successfully!',
    captureUnconfirmed:
      'The server does not confirm the payment yet. You can retry with Check. It was not marked as paid.',
    manualError: 'Could not confirm the capture right now',
    sdkError: 'Error capturing the order on the server',
    externalArmed:
      'Complete the payment in PayPal. When you return to this tab we will check the order with the server. It is not marked as paid until the server confirms it.',
    checkingServer: 'Checking the payment with the server…',
    orderStatusShown: (status: string) => `The order is listed as "${status}". It was not marked as paid.`,
    autoConfirmFail:
      'We did not confirm the payment automatically. Use Check to retry. Nothing was marked as paid.',
    stillWaiting: 'PayPal does not confirm the approval yet. We keep checking…',
    backgroundPaused:
      'This tab is in the background. We will keep checking when you return. Nothing was marked as paid.',
    reconcileFail:
      'We could not look up the order. You can retry with Check. It was not marked as paid.',
    cancelFlow:
      'The PayPal flow was cancelled or paused. If you authorized the payment in an external window, you can check the order status.',
    paypalIssue: (detail: string) =>
      `PayPal issue: ${detail}. You can check your order status to see whether it was received by the server.`,
    renderFail: (detail: string) => `Could not load the PayPal button: ${detail}`,
    sdkLoadFail: (detail: string) => `Error loading the PayPal SDK: ${detail}`,
    transactionFallback: 'The transaction could not be completed',
    renderFallback: 'render error',
    scriptFallback: 'script error',
    verifyBusy: 'Checking...',
    heading: 'Complete Secure Payment',
    orderBadge: (shortId: string) => `Order #${shortId}`,
    approvedTitle: '✓ Authorization received in PayPal',
    approvedBody:
      'Your order is authorized in PayPal. Confirm the final capture so the server verifies the transaction and credits your share.',
    approvedBusy: 'Checking and Capturing...',
    noProviderTitle: 'PayPal provider not configured on the server',
    noProviderBody:
      'The server reports that the PayPal Sandbox credentials are missing. Direct payment buttons cannot start in this environment without setting ',
    secureNote:
      'Pay securely through PayPal Sandbox. The payment only counts as complete once our server captures and verifies the transaction.',
    loadingSdk: 'Loading the official PayPal Sandbox interface...',
    sdkFallback: 'Could not start the PayPal gateway.',
    retrySdk: 'Retry loading PayPal',
    externalApprovalLink: 'Open the PayPal approval link provided by the order ↗',
    externalWindowLink: 'Pay in PayPal in an external window ↗',
    reconcileHint: 'Did you pay in another window or need to reconcile?',
  },
});
