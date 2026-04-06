import type { TranslationKeys } from './en';

/**
 * Spanish translations
 */
export const es: TranslationKeys = {
  // Site
  site: {
    name: 'ReArch',
    description: 'Background AI. Let your entire workforce ship.',
  },

  // Navigation
  nav: {
    home: 'Inicio',
    blog: 'Blog',
    contact: 'Contacto',
    docs: 'Docs',
    getStarted: 'Solicitar Acceso',
  },

  // Common
  common: {
    readMore: 'Leer más',
    loading: 'Cargando...',
    error: 'Ocurrió un error',
    notFound: 'Página no encontrada',
    backHome: 'Volver al inicio',
    copied: '¡Copiado!',
    copy: 'Copiar',
  },

  // Hero Section
  hero: {
    badge: 'Ahora en Acceso Anticipado',
    title: 'Background AI.',
    titleHighlight: 'Haz que todo tu equipo entregue código.',
    description:
      'ReArch es un agente de IA en segundo plano que escribe, prueba y despliega código — para que todos en tu equipo puedan construir, no solo los ingenieros.',
    cta: 'Solicitar Acceso',
    github: 'Ver en GitHub',
    socialProof: 'Permitiendo a equipos entregar código en toda la organización',
  },

  // Tech Stack Section
  techStack: {
    astro: {
      name: 'En Segundo Plano',
      desc: 'Agentesﬂ que trabajan mientras duermes',
    },
    tailwind: {
      name: 'Soporte MCP',
      desc: 'Elige de la galería o usa los tuyos',
    },
    typescript: {
      name: 'Verificación Visual',
      desc: 'Capturas de pantalla y vistas previas',
    },
    motion: {
      name: 'Multijugador',
      desc: 'Colabora en sesiones en tiempo real',
    },
  },

  // Feature Tabs Section
  features: {
    sectionTitle: 'Entrega código.',
    sectionTitleHighlight: 'Sin escribirlo.',
    sectionDescription:
      'ReArch da a cada persona en tu organización la capacidad de contribuir código — los agentes en segundo plano hacen el trabajo pesado.',
    tabs: {
      repositories: {
        label: 'Tus Repositorios',
        desc: 'Bitbucket o GitHub',
        title: 'Tus Repositorios',
        content:
          'Conecta tus repositorios de GitHub o Bitbucket. ReArch trabaja directamente con tu código existente — sin migración, sin dependencia de proveedor.',
      },
      models: {
        label: 'Últimos Modelos Frontier',
        desc: 'Modelos de IA de vanguardia',
        title: 'Últimos Modelos Frontier',
        content:
          'Impulsado por los últimos modelos frontier de IA. ReArch aprovecha modelos de lenguaje de vanguardia para entender tu código, generar cambios e iterar sobre el feedback.',
      },
      preview: {
        label: 'Vista Previa en Vivo',
        desc: 'Apps reales, pruebas reales',
        title: 'Vista Previa en Vivo',
        content:
          'Interactúa con vistas previas en vivo de tu aplicación en entornos aislados — no solo capturas de pantalla, aplicaciones reales. Los cambios en base de datos también se pueden previsualizar.',
      },
      mcp: {
        label: 'Servidores MCP',
        desc: 'Elige de la galería o usa los tuyos',
        title: 'Servidores MCP',
        content:
          'Elige de nuestra galería de servidores MCP preconfigurados, o trae los tuyos. Extiende las capacidades de ReArch con herramientas personalizadas, fuentes de datos e integraciones.',
      },
      cost: {
        label: 'Monitoreo de Costes',
        desc: 'Estadísticas por usuario, conversación, etc.',
        title: 'Monitoreo de Costes',
        content:
          'Rastrea el uso y los costes con estadísticas detalladas por usuario, conversación y proyecto. Mantén el control de tu gasto en IA con paneles en tiempo real.',
      },
      workspace: {
        label: 'Espacio de Trabajo',
        desc: 'VS Code también disponible',
        title: 'Espacio de Trabajo',
        content:
          'Trabaja directamente en el navegador o usa VS Code. ReArch proporciona una experiencia de desarrollo fluida donde prefieras programar.',
      },
    },
  },

  // Credibility Section
  credibility: {
    badge: 'Creado por Lab34',
    title: 'Permitiendo a cada persona en tu organización',
    titleHighlight: 'entregar código',
    paragraph1:
      'ReArch está construido sobre una idea simple: el cuello de botella en la mayoría de organizaciones no son las ideas — es la capacidad de convertir esas ideas en código desplegado. Los agentes en segundo plano cambian esta ecuación por completo.',
    paragraph2:
      'Con ReArch, un PM puede arreglar un bug que notó, un diseñador puede ajustar espaciado, y un ingeniero puede ejecutar diez sesiones paralelas en lugar de una. Todos entregan.',
    stats: {
      concurrency: {
        value: '\u221E',
        label: 'agentes concurrentes',
      },
      blackBoxes: {
        value: '0',
        label: 'cajas negras',
      },
      unreviewed: {
        value: '0',
        label: 'código desplegado sin tu revisión',
      },
    },
  },

  // CTA Section
  cta: {
    title: 'Deja de esperar.',
    titleHighlight: 'Empieza a entregar.',
    description:
      'Dale a toda tu fuerza laboral el poder de entregar código. ReArch trabaja en segundo plano para que puedas enfocarte en lo que importa.',
    docs: 'Saber Más',
    command: 'Ver en GitHub',
  },

  // Footer
  footer: {
    copyright: '© {year} ReArch. Todos los derechos reservados.',
    madeWith: 'Hecho con',
    maintainedBy: 'Creado por',
    links: {
      documentation: 'Documentación',
      github: 'GitHub',
      twitter: 'Twitter',
      license: 'Licencia',
    },
    legal: {
      legalNotice: 'Aviso Legal',
      privacyPolicy: 'Política de Privacidad',
      license: 'Licencia',
    },
  },

  // Home page
  home: {
    title: 'ReArch — Agente de IA en Segundo Plano',
    subtitle: 'Haz que todo tu equipo entregue código',
    cta: 'Solicitar Acceso',
  },

  // Contact page
  contact: {
    meta: {
      title: 'Contáctanos',
      description: 'Ponte en contacto con el equipo de ReArch.',
    },
    hero: {
      badge: 'Ponte en Contacto',
      title: 'Vamos a',
      titleHighlight: 'conectar.',
      description:
        '¿Tienes una pregunta sobre ReArch, quieres solicitar acceso o simplemente saludar? Nos encantaría saber de ti.',
    },
    form: {
      title: 'Envíanos un mensaje',
      name: 'Tu Nombre',
      namePlaceholder: 'María García',
      email: 'Correo Electrónico',
      emailPlaceholder: 'maria@empresa.com',
      subject: 'Asunto',
      subjectPlaceholder: '¿Cómo podemos ayudarte?',
      message: 'Mensaje',
      messagePlaceholder: 'Cuéntanos sobre tu equipo y cómo quieres usar ReArch...',
      submit: 'Enviar Mensaje',
      sending: 'Enviando...',
      success: '¡Mensaje enviado con éxito! Te responderemos pronto.',
      error: 'Error al enviar el mensaje. Por favor, inténtalo de nuevo más tarde.',
    },
    info: {
      title: 'Otras formas de contactarnos',
      email: {
        label: 'Correo',
        value: 'hello@rearch.engineer',
      },
      github: {
        label: 'GitHub',
        value: 'github.com/lab34-es/rearch.engineer',
      },
      twitter: {
        label: 'Twitter',
        value: '@rearch_eng',
      },
    },
  },

  // Forms
  form: {
    name: 'Nombre',
    email: 'Correo electrónico',
    message: 'Mensaje',
    submit: 'Enviar',
    sending: 'Enviando...',
    success: '¡Mensaje enviado con éxito!',
    error: 'Error al enviar el mensaje. Por favor, inténtalo de nuevo.',
  },

  // Blog
  blog: {
    title: 'Blog',
    description: 'Últimos artículos y actualizaciones del equipo de ReArch',
    allPosts: 'Todos los artículos',
    featured: 'Destacados',
    noPosts: 'No se encontraron artículos',
    relatedPosts: 'Artículos relacionados',
    backToBlog: 'Volver al Blog',
    subscribe: 'Suscríbete',
    subscribeDescription: 'Recibe los últimos artículos y actualizaciones en tu correo.',
    emailPlaceholder: 'Introduce tu correo',
    subscribeButton: 'Suscribirse',
  },

  // Components Page
  components: {
    meta: {
      title: 'Componentes',
      description:
        'Explora la biblioteca completa de componentes UI de ReArch. Listos para producción, accesibles y bellamente diseñados.',
    },
    hero: {
      badge: 'Componentes de Producción',
      title: 'Biblioteca de',
      titleHighlight: 'Componentes',
      description:
        'Primitivas UI listas para producción, construidas con accesibilidad y rendimiento en mente. Copia, pega y personaliza para tu marca.',
      browseComponents: 'Explorar Componentes',
      viewSource: 'Ver Código',
    },
    categories: {
      buttons: 'Botones',
      inputs: 'Campos de Formulario',
      feedback: 'Retroalimentación',
      overlays: 'Superposiciones',
      data: 'Visualización de Datos',
      loading: 'Cargando',
    },
    sections: {
      buttons: {
        title: 'Botones',
        description:
          'Elementos interactivos para acciones y navegación. Todas las variantes soportan iconos, estados de carga y accesibilidad completa.',
        variants: 'Variantes',
        variantsHint: '6 estilos para diferentes contextos',
        sizes: 'Tamaños',
        sizesHint: 'Escalado responsivo',
        states: 'Estados',
        withIcons: 'Con Iconos',
        primary: 'Primario',
        secondary: 'Secundario',
        outline: 'Contorno',
        ghost: 'Fantasma',
        link: 'Enlace',
        destructive: 'Destructivo',
        small: 'Pequeño',
        medium: 'Mediano',
        large: 'Grande',
        default: 'Por defecto',
        loading: 'Cargando',
        disabled: 'Deshabilitado',
        send: 'Enviar',
        export: 'Exportar',
        star: 'Favorito',
      },
      inputs: {
        title: 'Campos de Formulario',
        description:
          'Campos de texto, selectores, casillas de verificación y más. Construidos con validación nativa y soporte ARIA.',
        textInput: 'Campo de Texto',
        textInputHint: 'Con etiquetas y validación',
        textarea: 'Área de Texto',
        textareaHint: 'Entrada de texto multilínea',
        select: 'Selector',
        selectHint: 'Desplegable nativo',
        checkboxes: 'Casillas',
        checkboxesHint: 'Controles de selección múltiple',
        planSelection: 'Selección de Plan',
        planSelectionHint: 'Opciones tipo tarjeta',
        emailLabel: 'Correo electrónico',
        emailPlaceholder: 'tu@ejemplo.com',
        passwordLabel: 'Contraseña',
        passwordPlaceholder: '••••••••',
        passwordHint: 'Mínimo 8 caracteres',
        disabledLabel: 'Deshabilitado',
        disabledPlaceholder: 'No editable',
        messageLabel: 'Mensaje',
        messagePlaceholder: 'Escribe tu mensaje aquí...',
        messageHint: 'Soporta formato markdown',
        countryLabel: 'País',
        selectCountry: 'Selecciona un país...',
        termsLabel: 'Acepto los términos de servicio',
        updatesLabel: 'Enviarme actualizaciones del producto',
        notificationsLabel: 'Habilitar notificaciones',
        notificationsDesc: 'Recibir alertas de actualizaciones importantes',
        planFree: 'Gratis',
        planFreeDesc: 'Funciones básicas para proyectos personales',
        planPro: 'Pro',
        planProDesc: 'Herramientas avanzadas para profesionales',
        planTeam: 'Equipo',
        planTeamDesc: 'Funciones de colaboración para equipos',
      },
      feedback: {
        title: 'Retroalimentación',
        description:
          'Insignias, alertas e indicadores de estado para comunicar estados y guiar acciones del usuario.',
        badges: 'Insignias',
        badgesHint: 'Indicadores de estado',
        alerts: 'Alertas',
        alertsHint: 'Mensajes contextuales',
        default: 'Por defecto',
        success: 'Éxito',
        warning: 'Advertencia',
        error: 'Error',
        info: 'Info',
        tipTitle: 'Consejo',
        tipContent: 'Usa atajos de teclado para navegar más rápido. Presiona',
        tipKey: '⌘K',
        tipEnd: 'para abrir la paleta de comandos.',
        deployTitle: 'Despliegue exitoso',
        deployContent: 'Tus cambios están en vivo en',
        limitTitle: 'Acercándose al límite',
        limitContent: 'Has usado el 80% de tu cuota mensual de API. Considera actualizar tu plan.',
        buildTitle: 'Compilación fallida',
        buildContent: 'Error en',
        buildError: '— falta prop requerida "variant"',
      },
      overlays: {
        title: 'Superposiciones',
        description:
          'Diálogos, menús desplegables, tooltips y pestañas. Navegación completa por teclado y gestión de foco.',
        dialog: 'Diálogo',
        dialogHint: 'Superposición modal',
        dropdown: 'Menú',
        dropdownHint: 'Menú de acciones',
        tooltips: 'Tooltips',
        tooltipsHint: 'Sugerencias contextuales',
        tabs: 'Pestañas',
        tabsHint: 'Organización de contenido',
        openDialog: 'Abrir Diálogo',
        deleteTitle: '¿Eliminar proyecto?',
        deleteDesc: 'Esta acción no se puede deshacer.',
        deleteConfirm: '¿Estás seguro de que quieres eliminar',
        deleteWarning:
          'Todos los archivos, despliegues y datos analíticos serán eliminados permanentemente.',
        cancel: 'Cancelar',
        deleteProject: 'Eliminar Proyecto',
        actions: 'Acciones',
        edit: 'Editar',
        duplicate: 'Duplicar',
        share: 'Compartir',
        archive: 'Archivar',
        delete: 'Eliminar',
        top: 'Arriba',
        bottom: 'Abajo',
        left: 'Izquierda',
        right: 'Derecha',
        tooltipTop: 'Tooltip arriba',
        tooltipBottom: 'Tooltip abajo',
        tooltipLeft: 'Tooltip izquierda',
        tooltipRight: 'Tooltip derecha',
        overview: 'Resumen',
        analytics: 'Analíticas',
        settings: 'Configuración',
        overviewContent:
          'Resumen del proyecto con métricas clave y actividad reciente. Las pestañas soportan navegación completa por teclado.',
        analyticsContent:
          'Datos analíticos con gráficos e información de rendimiento. Usa las flechas para navegar entre pestañas.',
        settingsContent:
          'Configura los ajustes de tu proyecto. Usa Inicio/Fin para saltar a la primera/última pestaña.',
      },
      data: {
        title: 'Visualización de Datos',
        description:
          'Tarjetas, avatares e iconos para presentar contenido e información del usuario.',
        cards: 'Tarjetas',
        cardsHint: 'Contenedores de contenido',
        avatars: 'Avatares',
        avatarsHint: 'Representaciones de usuario',
        icons: 'Iconos',
        iconsHint: 'Set de iconos Lucide — 24 incluidos',
        stacked: 'Apilados',
        performance: 'Ejecución en Segundo Plano',
        performanceScore: 'VMs Aisladas',
        performanceDesc:
          'Cada sesión se ejecuta en su propio entorno aislado con tu stack de desarrollo completo.',
        typeSafe: 'Automatización de PRs',
        typeSafeScore: 'De Extremo a Extremo',
        typeSafeDesc:
          'De prompt a pull request — ReArch maneja la escritura de código, pruebas y feedback de revisión.',
        i18nReady: 'Multijugador',
        i18nScore: 'Tiempo Real',
        i18nDesc:
          'Múltiples miembros del equipo pueden colaborar en la misma sesión, con cambios atribuidos a cada persona.',
      },
      loading: {
        title: 'Cargando',
        description:
          'Esqueletos de carga para rendimiento percibido mientras se obtiene el contenido.',
        skeletonTypes: 'Tipos de Esqueleto',
        skeletonTypesHint: 'Texto, circular, rectangular',
        cardSkeleton: 'Esqueleto de Tarjeta',
        cardSkeletonHint: 'Estado de carga compuesto',
      },
    },
    cta: {
      title: '¿Listo para construir?',
      description:
        'Estos componentes son solo el comienzo. Explora la biblioteca completa de componentes de ReArch.',
      cloneRepo: 'Ver en GitHub',
      readDocs: 'Leer Documentación',
    },
  },

  // Consent Banner
  consent: {
    heading: 'Preferencias de Cookies',
    description:
      'Usamos cookies para mejorar tu experiencia de navegación, ofrecer contenido personalizado y analizar nuestro tráfico.',
    acceptAll: 'Aceptar Todo',
    declineAll: 'Rechazar Todo',
    customize: 'Personalizar',
    savePreferences: 'Guardar Preferencias',
    settingsHeading: 'Configuración de Privacidad',
    privacyPolicyLabel: 'Política de Privacidad',
    alwaysOn: 'Siempre activo',
  },
} as const;
