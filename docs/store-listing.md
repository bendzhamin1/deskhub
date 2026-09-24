# Листинг в Chrome Web Store

Тексты для консоли разработчика. Краткое описание (summary) отдельно вводить
не нужно: Store берёт его из `extDescription` в `_locales/<язык>/messages.json`.

## Что где заполнять

**Пакет.** Загрузить zip новой версии. Если предыдущая версия ещё на проверке,
новый пакет загрузить нельзя: либо дождаться решения, либо отменить проверку.

**Описание продукта** (Store listing). Язык по умолчанию — английский: он
задаётся `default_locale` в манифесте. В выпадающем списке языков появятся
локали из пакета; для каждой вставить подробное описание из разделов ниже.
Скриншоты можно загрузить общие (для всех языков) или отдельные на язык.
Прежнее русское описание переезжает в локаль «Русский».

**Меры по обеспечению конфиденциальности** (Privacy practices). Поля не
локализуются — пишем по-английски, это язык проверяющих.

- Single purpose:

  > DeskHub replaces Chrome's new tab page with a customizable desktop of
  > bookmark folders. Every feature serves that page: folders and tiles, their
  > appearance, syncing the layout across the user's devices, and a search box
  > that sends queries to the user's default search engine through the
  > chrome.search API. The extension does not set or change the search engine.

- Justification for `storage`:

  > Stores the user's folders, bookmarks and appearance settings in
  > chrome.storage.sync so the layout syncs across the user's own signed-in
  > devices, and keeps a local cache of site icons, the user's wallpaper and
  > search box history in chrome.storage.local. None of this is sent to the
  > developer or any other server.

- Justification for `search`:

  > The search box on the new tab page passes the typed query to
  > chrome.search.query, so it opens in the default search engine the user
  > selected in Chrome settings. The extension offers no search engine of its
  > own and does not change the user's choice.

- Remote code: No, I am not using remote code.
- Data usage: не собираются никакие категории данных; отметить три
  подтверждения (данные не продаются третьим лицам, не используются в целях,
  не связанных с основной функцией, не используются для оценки
  кредитоспособности).

**Распространение** (Distribution). Проверить, что выбраны все регионы.

## Подробное описание

### English

DeskHub turns Chrome's new tab page into a tidy desktop of folders and bookmarks.

• Folders and bookmarks right on the new tab, with drag-and-drop sorting
• Real site logos, with tile colors picked up from each brand automatically
• Customize any tile: name, address, your own logo and color
• Folder colors with adjustable opacity
• Your own wallpaper
• Light, dark or system theme — follows your OS automatically
• Three card sizes, glow and transparency settings, optional clock
• Export your setup to a file and share it with a friend
• Syncs across your computers through your Chrome account — no sign-up needed
• A search box that uses the default search engine from your Chrome settings, with suggestions from your own bookmarks and search history
• Available in English, Hindi, Spanish, French, Portuguese and Russian

Privacy: DeskHub has no servers and collects nothing. Your folders and settings live in Chrome's own storage. Site icons are loaded by domain name from public icon services.

### Hindi (हिन्दी)

DeskHub Chrome के नए टैब पेज को फ़ोल्डरों और बुकमार्क वाले एक व्यवस्थित डेस्कटॉप में बदल देता है।

• नए टैब पर ही फ़ोल्डर और बुकमार्क, ड्रैग-एंड-ड्रॉप से क्रम बदलें
• साइटों के असली लोगो, टाइल का रंग ब्रांड के हिसाब से अपने-आप
• हर टाइल अपने हिसाब से: नाम, पता, अपना लोगो और रंग
• फ़ोल्डरों के रंग, अपारदर्शिता बदलने की सुविधा के साथ
• अपना वॉलपेपर
• लाइट, डार्क या सिस्टम थीम — ऑपरेटिंग सिस्टम के साथ अपने-आप बदलती है
• कार्ड के तीन आकार, चमक और पारदर्शिता की सेटिंग, घड़ी
• अपना सेटअप फ़ाइल में एक्सपोर्ट करें और दोस्त के साथ शेयर करें
• Chrome खाते के ज़रिए आपके सभी कंप्यूटरों पर सिंक — अलग से रजिस्ट्रेशन की ज़रूरत नहीं
• सर्च बॉक्स Chrome सेटिंग्स में चुने गए डिफ़ॉल्ट सर्च इंजन का इस्तेमाल करता है, सुझाव आपके अपने बुकमार्क और सर्च इतिहास से आते हैं
• अंग्रेज़ी, हिन्दी, स्पेनिश, फ़्रेंच, पुर्तगाली और रूसी भाषा में उपलब्ध

निजता: DeskHub का कोई सर्वर नहीं है और यह कोई डेटा इकट्ठा नहीं करता। आपके फ़ोल्डर और सेटिंग्स Chrome के अपने स्टोरेज में रहते हैं। साइटों के आइकन डोमेन नाम के आधार पर सार्वजनिक आइकन सेवाओं से लोड होते हैं।

### Español

DeskHub convierte la página de nueva pestaña de Chrome en un escritorio ordenado con carpetas y marcadores.

• Carpetas y marcadores en la nueva pestaña, con orden por arrastrar y soltar
• Logotipos reales de los sitios y color del icono tomado de cada marca automáticamente
• Personaliza cualquier icono: nombre, dirección, tu propio logotipo y color
• Colores de carpeta con opacidad ajustable
• Tu propio fondo de pantalla
• Tema claro, oscuro o del sistema: cambia solo junto con tu sistema operativo
• Tres tamaños de tarjeta, ajustes de brillo y transparencia, reloj opcional
• Exporta tu configuración a un archivo y compártela con un amigo
• Se sincroniza entre tus ordenadores a través de tu cuenta de Chrome, sin registro
• Un cuadro de búsqueda que usa el buscador predeterminado de la configuración de Chrome, con sugerencias de tus propios marcadores e historial de búsqueda
• Disponible en inglés, hindi, español, francés, portugués y ruso

Privacidad: DeskHub no tiene servidores y no recopila nada. Tus carpetas y ajustes se guardan en el almacenamiento de Chrome. Los iconos de los sitios se cargan por nombre de dominio desde servicios públicos de iconos.

### Français

DeskHub transforme la page Nouvel onglet de Chrome en un bureau bien rangé, avec des dossiers et des favoris.

• Dossiers et favoris directement dans le nouvel onglet, triés par glisser-déposer
• Vrais logos des sites, avec la couleur de chaque vignette tirée automatiquement de la marque
• Personnalisez chaque vignette : nom, adresse, votre propre logo et couleur
• Couleurs de dossier avec opacité réglable
• Votre propre fond d’écran
• Thème clair, sombre ou système : il suit automatiquement votre OS
• Trois tailles de cartes, réglages de lueur et de transparence, horloge en option
• Exportez votre configuration dans un fichier et partagez-la avec un ami
• Synchronisation entre vos ordinateurs via votre compte Chrome, sans inscription
• Un champ de recherche qui utilise le moteur de recherche par défaut défini dans Chrome, avec des suggestions tirées de vos propres favoris et de votre historique de recherche
• Disponible en anglais, hindi, espagnol, français, portugais et russe

Confidentialité : DeskHub n’a pas de serveur et ne collecte rien. Vos dossiers et réglages restent dans le stockage de Chrome. Les icônes des sites sont chargées à partir du nom de domaine auprès de services d’icônes publics.

### Português (Brasil)

O DeskHub transforma a página de nova guia do Chrome em uma área de trabalho organizada, com pastas e favoritos.

• Pastas e favoritos direto na nova guia, com organização por arrastar e soltar
• Logotipos reais dos sites, com a cor de cada ícone definida automaticamente pela marca
• Personalize qualquer ícone: nome, endereço, seu próprio logotipo e cor
• Cores de pasta com opacidade ajustável
• Seu próprio papel de parede
• Tema claro, escuro ou do sistema, que acompanha o sistema operacional automaticamente
• Três tamanhos de cartão, ajustes de brilho e transparência, relógio opcional
• Exporte sua configuração para um arquivo e compartilhe com um amigo
• Sincroniza entre seus computadores pela sua conta do Chrome, sem cadastro
• Uma caixa de pesquisa que usa o mecanismo de pesquisa padrão das configurações do Chrome, com sugestões dos seus próprios favoritos e do seu histórico de pesquisa
• Disponível em inglês, hindi, espanhol, francês, português e russo

Privacidade: o DeskHub não tem servidores e não coleta nada. Suas pastas e configurações ficam no armazenamento do próprio Chrome. Os ícones dos sites são carregados pelo nome de domínio a partir de serviços públicos de ícones.

### Português (Portugal)

O DeskHub transforma a página de novo separador do Chrome numa área de trabalho organizada, com pastas e marcadores.

• Pastas e marcadores diretamente no novo separador, organizados por arrastar e largar
• Logótipos reais dos sites, com a cor de cada ícone definida automaticamente pela marca
• Personalize qualquer ícone: nome, endereço, o seu próprio logótipo e cor
• Cores de pasta com opacidade ajustável
• A sua própria imagem de fundo
• Tema claro, escuro ou do sistema, que acompanha o sistema operativo automaticamente
• Três tamanhos de cartão, definições de brilho e transparência, relógio opcional
• Exporte a sua configuração para um ficheiro e partilhe-a com um amigo
• Sincroniza entre os seus computadores através da sua conta do Chrome, sem registo
• Uma caixa de pesquisa que utiliza o motor de pesquisa predefinido nas definições do Chrome, com sugestões dos seus próprios marcadores e do seu histórico de pesquisa
• Disponível em inglês, hindi, espanhol, francês, português e russo

Privacidade: o DeskHub não tem servidores e não recolhe nada. As suas pastas e definições ficam no armazenamento do próprio Chrome. Os ícones dos sites são carregados pelo nome de domínio a partir de serviços públicos de ícones.

### Русский

DeskHub превращает страницу новой вкладки Chrome в аккуратный рабочий стол с папками и закладками.

• Папки и закладки прямо на новой вкладке, сортировка перетаскиванием
• Настоящие логотипы сайтов, цвет плитки подбирается под бренд автоматически
• Любую плитку можно настроить: название, адрес, свой логотип и цвет
• Свой цвет папок с регулируемой прозрачностью
• Свои обои
• Светлая, тёмная тема или «как в системе» — переключается вслед за ОС
• Три размера карточек, настройка свечения и прозрачности, часы
• Экспорт набора в файл — можно передать другу
• Синхронизация между компьютерами через аккаунт Chrome, без регистрации
• Строка поиска работает через поисковую систему по умолчанию из настроек Chrome, подсказки — из ваших закладок и истории поиска
• Интерфейс на английском, хинди, испанском, французском, португальском и русском

Конфиденциальность: у DeskHub нет серверов, он ничего не собирает. Папки и настройки хранятся в хранилище самого Chrome. Значки сайтов загружаются по имени домена из публичных сервисов иконок.
