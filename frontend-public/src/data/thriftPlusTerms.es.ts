/**
 * Thrift+ terms, Spanish: word for word from `.ai/reference/thrift-plus-terms/terms-es.md`. A courtesy translation
 * (a native speaker still checks it, rulebook V5); the English controls. Brand words stay in English (Thrift+,
 * ThriftBucks, AS IS). The `ui` words, the QR alt text and the store-terms heading are page chrome written for the
 * build, not from the .md file. See thriftPlusTerms.ts.
 */
import type { ThriftPlusTermsContent } from './thriftPlusTerms'

export const THRIFT_PLUS_TERMS_ES: ThriftPlusTermsContent = {
  lang: 'es',
  ui: {
    seoTitle: 'Términos de Thrift+',
    seoDescription:
      'Thrift+ en Eco-Thrift: unirse es gratis, ThriftBucks en la mayoría de los artículos y devoluciones en 3 días. Lo que necesita saber, preguntas frecuentes y los términos completos.',
    home: 'Inicio',
    terms: 'Términos',
    languageGroup: 'Idioma',
    storeTermsLink: 'Términos de la tienda (en inglés)',
    storeTermsTitle: 'Términos de la tienda (en inglés)',
  },

  courtesyNote: 'Esta es una traducción de cortesía. Si hay alguna diferencia, la versión en inglés es la que vale.',

  hero: {
    title: 'Thrift+',
    tagline: '¡ThriftBucks, devoluciones en 3 días y más!',
  },

  needToKnowTitle: 'Lo que necesita saber',
  needToKnow: [
    { label: 'Unirse es gratis.', text: 'No se debe nada.' },
    {
      label: 'ThriftBucks en la mayoría de los artículos.',
      text: 'Los ThriftBucks son el premio de Thrift+: crecen mientras el artículo está en la tienda, hasta el 95% del precio de la etiqueta. Escanee cualquier etiqueta para ver los ThriftBucks de hoy.',
    },
    {
      label: 'Guardados para la próxima, la opción predeterminada.',
      text: 'Sus ThriftBucks se quedan en su cuenta. Úselos a partir del día siguiente, durante 30 días, por su valor completo.',
    },
    {
      label: 'O canjéelos al instante.',
      text: 'Al 50% de su valor, descontado del precio de hoy. Solo dígaselo al cajero.',
    },
    {
      label: 'Devoluciones en 3 días.',
      text: 'Traiga un artículo que califique dentro de 3 días, por cualquier razón: el 80% de lo que pagó se le regresa como crédito Thrift+.',
    },
    {
      label: 'Quienes no son miembros pagan la etiqueta.',
      text: 'Todo lo que compra alguien que no es miembro se vende AS IS (tal como está). Ventas finales.',
    },
  ],

  buttons: {
    scan: {
      label: 'Abrir el escáner',
      href: '/scan',
      qrUrl: 'https://ecothrift.us/scan',
      caption: 'ecothrift.us/scan',
      qrAlt: 'Código QR para ecothrift.us/scan',
    },
    join: {
      label: 'Unirse a Thrift+',
      href: '/join',
      qrUrl: 'https://ecothrift.us/join',
      caption: 'ecothrift.us/join',
      qrAlt: 'Código QR para ecothrift.us/join',
    },
  },

  chartTitle: 'La tabla',
  chartHead: { num: '#', what: 'Qué', short: 'En breve', terms: 'Términos' },
  chart: [
    { num: 'A.1', what: 'Costo', short: 'Unirse es gratis. No se debe nada.', section: 2 },
    {
      num: 'A.2',
      what: 'Quién puede unirse',
      short: 'Mayores de 18 años. Hasta 2 adultos comparten una membresía.',
      section: 1,
    },
    {
      num: 'A.3',
      what: 'Antes de que su membresía funcione',
      short: 'Su nombre, una foto, su firma y la revisión de una identificación con foto en la caja.',
      section: 1,
    },
    {
      num: 'B.1',
      what: 'ThriftBucks',
      short: 'En la mayoría de los artículos. Crecen mientras el artículo está en la tienda, hasta el 95% de la etiqueta.',
      section: 3,
    },
    {
      num: 'B.2',
      what: 'Guardados (predeterminado)',
      short: 'Se quedan en su cuenta. Úselos a partir del día siguiente, durante 30 días, por su valor completo.',
      section: 4,
    },
    {
      num: 'B.3',
      what: 'Canjeados al instante',
      short: 'Al 50% de su valor, descontado del precio de hoy. Dígaselo al cajero.',
      section: 4,
    },
    {
      num: 'B.4',
      what: 'Valor en efectivo',
      short: 'Ninguno. Los ThriftBucks no se venden, cambian ni pasan a otra persona.',
      section: 6,
    },
    {
      num: 'C.1',
      what: 'Devoluciones en 3 días',
      short: 'Artículos que califican, por cualquier razón. Su recibo marca cada uno ("3-day return").',
      section: 8,
    },
    { num: 'C.2', what: 'Plazo', short: '3 días naturales después del día de la venta.', section: 8 },
    {
      num: 'C.3',
      what: 'Lo que recibe',
      short: 'El 80% de lo que pagó, impuestos incluidos, como crédito Thrift+. Nunca a su forma de pago.',
      section: 8,
    },
    {
      num: 'C.4',
      what: 'No se devuelve',
      short: 'Artículos marcados AS IS en la etiqueta o el recibo, y artículos que no califican.',
      section: 8,
    },
    { num: 'D.1', what: 'Quienes no son miembros', short: 'Se vende AS IS (tal como está). Ventas finales.', section: 9 },
    {
      num: 'D.2',
      what: 'Su foto e identificación',
      short: 'Solo para verificación. Nunca guardamos una copia de su identificación.',
      section: 10,
    },
    {
      num: 'D.3',
      what: 'Correo electrónico',
      short:
        'Recibos, novedades de Thrift+ y enlaces para iniciar sesión. Noticias de la tienda que puede desactivar. Mensajes de texto solo con los códigos para iniciar sesión que usted pida.',
      section: 10,
    },
  ],

  faqTitle: 'Preguntas frecuentes',
  faq: [
    {
      q: '¿Thrift+ es realmente gratis?',
      a: 'Sí. No hay que pagar nada para unirse ni nada cada mes. Nunca debe nada.',
    },
    {
      q: '¿Cómo crecen los ThriftBucks?',
      a: 'La mayoría de los artículos reúnen ThriftBucks que crecen mientras más tiempo estén en la tienda, hasta el 95% de la etiqueta. Eco-Thrift los fija y pueden cambiar de un día a otro. Escanee cualquier etiqueta con el escáner de Thrift+ para ver sus ThriftBucks de hoy.',
    },
    {
      q: '¿Qué significa "canjear al instante"?',
      a: 'Guardar sus ThriftBucks es la opción predeterminada: se quedan en su cuenta y los puede usar a partir del día siguiente durante 30 días, por su valor completo. Si prefiere usarlos de inmediato, dígaselo al cajero y canjéelos al instante, al 50% de su valor, descontado del precio de hoy. Una sola decisión cubre toda la compra.',
    },
    {
      q: '¿Cuándo vencen mis ThriftBucks?',
      a: 'Los ThriftBucks de cada compra sirven desde el día siguiente y durante 30 días. Sus recibos y Mi cuenta muestran cada fecha de vencimiento, la más próxima primero.',
    },
    {
      q: '¿Puedo usar los ThriftBucks en cualquier cosa?',
      a: 'Sí, en todo lo que compre en Eco-Thrift.',
    },
    {
      q: '¿Puedo devolver algo?',
      a: 'Sí, por cualquier razón, si su recibo lo marca "3-day return". Tráigalo a cualquier caja dentro de los 3 días después del día de compra, con el código QR de miembro en su app Thrift+ o su número de teléfono. Recibe el 80% de lo que pagó, impuestos incluidos, como crédito Thrift+.',
    },
    {
      q: '¿Qué no se puede devolver?',
      a: 'Cualquier artículo marcado AS IS en su etiqueta o recibo, y los artículos que no califican; su recibo marca cada artículo. El artículo debe regresar como salió: sin romperse, dañarse ni usarse mucho después de la venta.',
    },
    {
      q: '¿Hay un límite de devoluciones?',
      a: 'Llevamos un registro de las devoluciones. A un miembro que devuelve artículos con demasiada frecuencia se le pueden limitar o rechazar las devoluciones.',
    },
    {
      q: '¿Puedo cambiar una devolución por otro artículo?',
      a: 'No se hacen cambios. Una devolución se le regresa como crédito Thrift+, que nunca vence y que puede usar en cualquier artículo de la tienda.',
    },
    {
      q: '¿Cómo muestro que soy miembro?',
      a: 'En la caja, muestre el código QR de miembro en su app Thrift+ o dé el número de teléfono de su cuenta.',
    },
    {
      q: '¿Mi pareja puede compartir mi membresía?',
      a: 'Sí. Hasta 2 adultos pueden compartir una membresía y un saldo. Ambos deben estar en la caja para agregar al segundo adulto.',
    },
    {
      q: '¿Guardan mi identificación o mi foto?',
      a: 'Revisamos su identificación con foto una vez para confirmar su nombre y su edad, y no guardamos nada de ella. Su foto solo sirve para que el personal confirme que es usted. Nunca se usa para publicidad ni se comparte, y se borra 24 meses después de su última compra, o antes si lo pide.',
    },
    {
      q: '¿Me van a mandar mensajes de texto?',
      a: 'No. Si nos da un correo electrónico, le enviamos recibos y novedades de Thrift+. Los correos con noticias de la tienda siempre tienen un enlace para darse de baja.',
    },
    {
      q: '¿Puedo cambiar los ThriftBucks por efectivo?',
      a: 'No. Los ThriftBucks no tienen valor en efectivo. El crédito Thrift+ tampoco es efectivo, salvo cuando estos términos o la ley lo indiquen.',
    },
  ],

  perksTitle: 'Beneficios para miembros',
  // Live perks only (Design 10-15): M1 "Aparte artículos en línea." / "Aparte artículos de ecothrift.us para recogerlos
  // en la tienda." comes back when online holds are switched on.
  perks: [],

  fullTitle: 'Términos completos',
  fullIntro: {
    label: 'Términos de la membresía Thrift+.',
    text: 'EcoThrift LLC, 8425 West Center Road, Omaha, NE 68124 · (402) 881-9861',
    version: 'Versión: 19 de octubre de 2026.',
  },

  sections: [
    {
      num: 1,
      title: 'Cómo unirse',
      clauses: [
        {
          n: '1.1',
          text: 'Thrift+ es un programa de membresía gratuito de EcoThrift LLC ("Eco-Thrift", "nosotros"). Debe tener 18 años o más para unirse.',
        },
        {
          n: '1.2',
          text: 'Hasta 2 adultos pueden compartir una membresía y una cuenta. Ambos deben estar presentes en una caja para agregar al segundo adulto, y el primer adulto lo aprueba.',
        },
        {
          n: '1.3',
          text: 'Su membresía funciona solo después de que tengamos su nombre, su foto y su firma, y el personal haya revisado su identificación con foto en una caja. Hasta entonces, su cuenta no reúne ni usa nada. Únase en su teléfono en ecothrift.us/join con su nombre y Google, su número de celular o su correo; tómese la foto (una selfie) y firme en la app Thrift+; luego muestre su QR de miembro y su identificación con foto en cualquier caja. Si no se toma la selfie o no firma, le tomamos la foto y firma en la caja.',
        },
        { n: '1.4', text: 'Al firmar, acepta estos términos y la autorización de foto de la §10.' },
        {
          n: '1.5',
          text: 'Los artículos para mayores de 18 años requieren revisar la identificación cada vez, sea miembro o no.',
        },
      ],
    },
    {
      num: 2,
      title: 'Gratis',
      clauses: [{ n: '2.1', text: 'Unirse a Thrift+ es gratis. No hay cuotas mensuales y no se debe nada.' }],
    },
    {
      num: 3,
      title: 'ThriftBucks',
      clauses: [
        {
          n: '3.1',
          text: 'Los miembros reúnen ThriftBucks en la mayoría de los artículos. Un artículo en sus primeros 7 días en el piso de venta todavía no los tiene, ni tampoco la mercancía de bodega que todavía no ha estado en el piso.',
        },
        {
          n: '3.2',
          text: 'Los ThriftBucks crecen mientras el artículo está en la tienda, hasta el 95% del precio de su etiqueta. Eco-Thrift fija los ThriftBucks, pueden cambiar de un día a otro y se muestran en el escáner de Thrift+ y en la caja.',
        },
      ],
    },
    {
      num: 4,
      title: 'Guardar los ThriftBucks o canjearlos al instante',
      clauses: [
        {
          n: '4.1',
          label: 'Guardados (predeterminado).',
          text: 'Los ThriftBucks de una compra se guardan completos en su cuenta, automáticamente. Se pueden usar por su valor completo desde el día siguiente a la compra hasta el día 30 después de ella; después vencen.',
        },
        {
          n: '4.2',
          label: 'Canjeados al instante.',
          text: 'Si se lo dice al cajero, puede en su lugar canjear al instante los ThriftBucks de esa compra, al 50% de su valor, descontado del precio de ese día y redondeado al centavo a su favor. Una sola decisión cubre toda la compra.',
        },
        { n: '4.3', text: 'No se ofrece el canje al instante cuando el crédito Thrift+ cubre todo el total (§5).' },
      ],
    },
    {
      num: 5,
      title: 'Cómo se usan los ThriftBucks y el crédito Thrift+',
      clauses: [
        {
          n: '5.1',
          text: 'El crédito Thrift+ siempre se usa primero, automáticamente, como pago después de impuestos. Los ThriftBucks guardados se aplican a lo que falta, empezando por la fecha de vencimiento más próxima, como reducción del precio antes de impuestos.',
        },
        {
          n: '5.2',
          text: 'Los artículos comprados con ThriftBucks o con crédito Thrift+ también reúnen ThriftBucks.',
        },
        {
          n: '5.3',
          text: 'Sus ThriftBucks, sus fechas de vencimiento y su crédito Thrift+ aparecen en sus recibos y en Mi cuenta.',
        },
      ],
    },
    {
      num: 6,
      title: 'Sin valor en efectivo; sin transferencias',
      clauses: [
        {
          n: '6.1',
          text: 'Los ThriftBucks son un premio de lealtad de Eco-Thrift, no algo que usted compra. Los ThriftBucks no tienen valor en efectivo.',
        },
        {
          n: '6.2',
          text: 'Los ThriftBucks y el crédito Thrift+ no se pueden vender, intercambiar ni transferir a nadie fuera de su membresía.',
        },
        { n: '6.3', text: 'No se cobra nada por recibir, guardar o usar ThriftBucks.' },
        {
          n: '6.4',
          text: 'Si pierde su teléfono, o alguien más vio su código QR de miembro, pregunte en cualquier caja: reemplazamos su código de miembro, el anterior deja de funcionar de inmediato y su app muestra el nuevo. Sus ThriftBucks y su crédito se quedan en su cuenta.',
        },
      ],
    },
    {
      num: 7,
      title: 'Crédito Thrift+',
      clauses: [
        { n: '7.1', text: 'El crédito Thrift+ es la parte en dinero de una devolución (§8). Nunca vence.' },
        {
          n: '7.2',
          text: 'El crédito Thrift+ no se puede cambiar por efectivo, salvo lo que indica la §8.5 o cuando la ley lo exija. El crédito Thrift+ sin usar durante 3 años se reporta al Tesorero del Estado de Nebraska, como lo exige la ley.',
        },
      ],
    },
    {
      num: 8,
      title: 'Devoluciones en 3 días de Thrift+',
      clauses: [
        { n: '8.1', label: 'Quién.', text: 'El miembro de Thrift+ que compró el artículo en su cuenta.' },
        {
          n: '8.2',
          label: 'Qué se puede devolver.',
          text: 'Los artículos que su recibo marca "3-day return", por cualquier razón. No preguntamos por qué y no probamos los artículos. Los artículos marcados AS IS en la etiqueta o el recibo no se pueden devolver.',
        },
        {
          n: '8.3',
          label: 'Plazo.',
          text: '3 días naturales después del día de la venta. ¿Lo compró un lunes? Tráigalo a más tardar el jueves. El plazo no se extiende por razones del cliente.',
        },
        {
          n: '8.4',
          label: 'Cómo.',
          steps: [
            'Traiga el artículo a cualquier caja dentro de los 3 días con el código QR de miembro en su app Thrift+ o el número de teléfono de su cuenta.',
            'Debe ser el artículo de esa compra, sin romperse, dañarse ni usarse mucho después de la venta.',
            'Si le decimos que no, puede pedir que un gerente lo revise.',
          ],
        },
        {
          n: '8.5',
          label: 'Lo que recibe.',
          points: [
            {
              label: 'Lo que pagó:',
              text: 'el 80% de lo que pagó por el artículo, impuestos incluidos, como crédito Thrift+, que nunca vence. Nunca se reembolsa a su forma de pago.',
            },
            {
              label: 'ThriftBucks que usó en él:',
              text: 'el 80% de los ThriftBucks que haya usado se le regresa como ThriftBucks con 30 días nuevos.',
            },
            {
              label: 'ThriftBucks que reunió el artículo:',
              text: 'usted conserva el 20%. Retiramos el otro 80% de sus ThriftBucks sin usar. Si ya los usó, su crédito se reduce en esa cantidad; si ya vencieron, no se retira nada.',
            },
            {
              label: 'Cuándo se resuelve:',
              text: 'la devolución se resuelve el día en que la trae, y ningún recibo anterior cambia.',
            },
            { label: 'Sin cambios:', text: 'una devolución nunca es un cambio por otro artículo.' },
            {
              label: 'Efectivo:',
              text: 'si no podemos darle crédito Thrift+ utilizable (por ejemplo, si la tienda cierra o su membresía termina), le reembolsamos la misma cantidad en efectivo.',
            },
          ],
        },
        {
          n: '8.6',
          label: 'No es una garantía.',
          text: 'Las devoluciones en 3 días son un privilegio de devolución para los miembros. No son una garantía, y todo artículo se vende AS IS (§9).',
        },
        {
          n: '8.7',
          label: 'Demasiadas devoluciones.',
          text: 'Llevamos un registro de las devoluciones. Si un miembro devuelve artículos con demasiada frecuencia, o hace mal uso de las devoluciones, podemos limitar o rechazar sus devoluciones, o terminar su membresía (§11.3).',
        },
      ],
    },
    {
      num: 9,
      title: 'Ventas AS IS (tal como está)',
      clauses: [
        {
          n: '9.1',
          text: 'Todo artículo se vende AS IS (tal como está), con todos sus defectos, sin garantías expresas ni implícitas, incluida la de comerciabilidad. Quienes no son miembros: ventas finales. Los miembros pueden devolver los artículos que califican según la §8.',
        },
      ],
    },
    {
      num: 10,
      title: 'Su foto, su identificación y su correo electrónico',
      clauses: [
        {
          n: '10.1',
          label: 'Foto.',
          text: 'Usted se toma la foto (una selfie) en la app Thrift+, o se la tomamos en la caja; el personal la compara con su identificación con foto. Solo sirve para que el personal confirme que es usted. Nunca se usa para publicidad ni para reconocimiento facial, ni se comparte. La borramos 24 meses después de su última compra, o dentro de los 30 días después de que lo pida.',
        },
        {
          n: '10.2',
          label: 'Identificación.',
          text: 'El personal revisa su identificación con foto una vez para confirmar su nombre, su edad y su rostro. No se escanea, copia ni guarda nada de su identificación. Solo registramos que se revisó, quién la revisó y cuándo.',
        },
        {
          n: '10.3',
          label: 'Correo electrónico.',
          text: 'Es opcional. Si nos lo da, le enviamos recibos y novedades de Thrift+, y noticias de la tienda que puede desactivar en cualquier momento (con el enlace para darse de baja en cada correo de noticias, en Mi cuenta o en cualquier caja). Los únicos mensajes de texto que enviamos son los códigos para iniciar sesión que usted pida. Nunca vendemos ni compartimos su número de celular.',
        },
        {
          n: '10.4',
          label: 'Iniciar sesión.',
          text: 'No hay contraseña. Inicie sesión con Google, o con un código de 6 dígitos que le enviamos por mensaje de texto a su celular o por correo (un enlace por correo también funciona). Cada código o enlace funciona una sola vez y por poco tiempo. Un teléfono se mantiene con la sesión iniciada por un año mientras lo use; cerrar sesión la termina. Pueden aplicarse cargos por mensajes y datos.',
        },
      ],
    },
    {
      num: 11,
      title: 'Cambios y terminación',
      clauses: [
        {
          n: '11.1',
          text: 'Podemos cambiar o terminar Thrift+ hacia adelante. Avisaremos en la tienda y en ecothrift.us antes de que un cambio entre en vigor.',
        },
        {
          n: '11.2',
          text: 'Los ThriftBucks ya reunidos se pueden usar hasta su fecha de vencimiento, y el crédito Thrift+ siempre se respeta o se paga en efectivo.',
        },
        {
          n: '11.3',
          text: 'Una membresía terminada por mal uso pierde sus ThriftBucks sin usar; su crédito Thrift+ se sigue respetando.',
        },
      ],
    },
    {
      num: 12,
      title: 'Contacto',
      clauses: [{ text: 'EcoThrift LLC · 8425 West Center Road, Omaha, NE 68124 · (402) 881-9861 · ecothrift.us' }],
    },
  ],
}
