document.addEventListener('alpine:init', () => {
    const pb = new PocketBase(window.location.origin);

    Alpine.data('timetableApp', () => ({
        viewMode: 'month',
        showSettings: false,
        searchQuery: '', 
        currentDate: new Date(),
        grid: [],
        days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],

        categories: [],
        selectedCategoryId: '',
        newCatName: '',
        newCatColor: '#3b82f6',

        events: [],
        newName: '',
        newDate: new Date().toISOString().split('T')[0],
        newTime: '09:00',
        newEndTime: '10:00',
        newColor: '#3b82f6', 
        colorMode: 'cat', 
        
        isRecurring: false,
        recurrenceRule: 'weekly',
        recurrenceEnd: '',

        showDeleteModal: false,
        deletingEvent: null,
        deletingDate: null,

        showEditChoiceModal: false,
        editingEvent: null,
        editingDate: null,
        isEditMode: false,

        async init() {
            await this.refreshCategories();
            await this.refreshEvents();
            this.render();
            this.$watch('viewMode', () => this.render());
            this.$watch('currentDate', () => this.render());
            this.$watch('selectedCategoryId', (id) => {
            if (this.colorMode === 'cat') {
                const cat = this.categories.find(c => c.id === id);
                if (cat) this.newColor = cat.color;
            }
        });
        },

        async refreshCategories() {
            try {
                this.categories = await pb.collection('categories').getFullList({ sort: 'name' });
                if (this.categories.length > 0 && !this.selectedCategoryId) {
                    this.selectedCategoryId = this.categories[0].id;
                }
            } catch (err) { console.error("Category fetch failed", err); }
        },

        async addCategory() {
            if (!this.newCatName) return;
            try {
                await pb.collection('categories').create({ name: this.newCatName, color: this.newCatColor });
                this.newCatName = '';
                await this.refreshCategories();
            } catch (err) { console.error("Add category failed", err); }
        },

        async deleteCategory(id) {
            if (!confirm("Delete category?")) return;
            try {
                await pb.collection('categories').delete(id);
                await this.refreshCategories();
            } catch (err) { console.error("Delete category failed", err); }
        },

        next() { this.adjustDate(1); },
        prev() { this.adjustDate(-1); },
        today() { this.currentDate = new Date(); this.render(); },

        adjustDate(offset) {
            let d = new Date(this.currentDate);
            if (this.viewMode === 'year') d.setFullYear(d.getFullYear() + offset);
            else if (this.viewMode === 'month') d.setMonth(d.getMonth() + offset);
            else if (this.viewMode === 'week') d.setDate(d.getDate() + (offset * 7));
            else if (this.viewMode === 'day') d.setDate(d.getDate() + offset);
            this.currentDate = d;
        },

        render() {
            if (this.viewMode === 'month') {
                this.grid = this.generateMonthGrid(this.currentDate);
            } else if (this.viewMode === 'week') {
                this.grid = this.generateWeekGrid(this.currentDate);
            }
        },

        generateMonthGrid(date) {
            const year = date.getFullYear();
            const month = date.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const todayStr = new Date().toDateString();

            const cells = [];
            for (let i = 0; i < firstDay; i++) cells.push({ day: '', fullDate: null, current: false });
            for (let i = 1; i <= daysInMonth; i++) {
                const cellDate = new Date(year, month, i);
                cells.push({ day: i, fullDate: cellDate, current: cellDate.toDateString() === todayStr });
            }
            return cells;
        },

        generateWeekGrid(date) {
            const startOfWeek = new Date(date);
            startOfWeek.setDate(date.getDate() - date.getDay());
            const days = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(startOfWeek);
                d.setDate(startOfWeek.getDate() + i);
                days.push({
                    day: d.getDate(),
                    fullDate: d,
                    current: d.toDateString() === new Date().toDateString()
                });
            }
            return days;
        },

        generateMonthDays(year, month) {
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const todayStr = new Date().toDateString();
            const days = [];
            for (let i = 1; i <= daysInMonth; i++) {
                const d = new Date(year, month, i);
                days.push({
                    num: i,
                    date: d,
                    current: d.toDateString() === todayStr,
                    id: `mini-${year}-${month}-${i}`
                });
            }
            return days;
        },

        getEventsForDay(dateInput) {
            if (!dateInput) return [];
            
            const compareDate = new Date(dateInput);
            compareDate.setHours(0, 0, 0, 0);

            const dateISO = compareDate.toLocaleDateString('en-CA');

            return this.events.filter(event => {
                if (event.exceptions && Array.isArray(event.exceptions)) {
                    if (event.exceptions.includes(dateISO)) return false;
                }

                const start = new Date(event.date);
                start.setHours(0, 0, 0, 0);
                const endRange = event.recurrence_end ? new Date(event.recurrence_end) : null;
                if (endRange) endRange.setHours(0, 0, 0, 0);

                let dateMatch = false;

                if (this.isSameDay(start, compareDate)) {
                    dateMatch = true;
                } 
                else if (event.is_recurring) {
                    if (compareDate >= start && (!endRange || compareDate <= endRange)) {
                        if (event.recurrence_rule === 'daily') dateMatch = true;
                        if (event.recurrence_rule === 'weekly') dateMatch = start.getDay() === compareDate.getDay();
                        if (event.recurrence_rule === 'monthly') dateMatch = start.getDate() === compareDate.getDate();
                    }
                }

                if (!dateMatch) return false;

                if (this.searchQuery.trim() !== '') {
                    const q = this.searchQuery.toLowerCase();
                    return event.name.toLowerCase().includes(q) || 
                        (event.category && event.category.toLowerCase().includes(q));
                }

                return true;
            }).sort((a, b) => a.start_time.localeCompare(b.start_time));
        },

        getHeaderText() {
            const year = this.currentDate.getFullYear();
            const month = this.months[this.currentDate.getMonth()];
            
            if (this.viewMode === 'year') return { main: year, sub: 'Annual Overview' };
            if (this.viewMode === 'day') return { main: this.currentDate.getDate(), sub: `${month} ${year}` };
            
            if (this.viewMode === 'week') {
                const start = new Date(this.currentDate);
                start.setDate(this.currentDate.getDate() - this.currentDate.getDay());
                
                return { 
                    main: 'Week', 
                    details: `starting ${start.getDate()}`, 
                    sub: `${this.months[start.getMonth()]} ${year}` 
                };
            }
            
            return { main: month, sub: year };
        },

        async refreshEvents() {
            try { this.events = await pb.collection('events').getFullList({ sort: 'date,start_time' }); }
            catch (err) { console.error("Fetch failed", err); }
        },

        async addEvent() {
            if (!this.newName) return;
            let finalColor = this.newColor;
            let finalCat = "Custom";

            if (this.colorMode === 'cat') {
                if (!this.selectedCategoryId) return;
                const cat = this.categories.find(c => c.id === this.selectedCategoryId);
                finalColor = cat.color;
                finalCat = cat.name;
            }

            const eventDate = new Date(this.newDate + 'T00:00:00');
            
            const data = {
                "name": this.newName,
                "category": finalCat,
                "color": finalColor,
                "date": eventDate.toISOString(),
                "start_time": this.newTime,
                "end_time": this.newEndTime,
                "is_recurring": this.isRecurring,
                "recurrence_rule": this.isRecurring ? this.recurrenceRule : "weekly",
                "recurrence_end": (this.isRecurring && this.recurrenceEnd) ? 
                                new Date(this.recurrenceEnd + 'T23:59:59').toISOString() : null
            };

            try {
                await pb.collection('events').create(data);
                this.newName = '';
                this.isRecurring = false;
                this.recurrenceEnd = ''; 
                await this.refreshEvents(); 
                this.render();
            } catch (err) { console.error("Error saving:", err); }
        },

        triggerDelete(event, instanceDate) {
            if (!event.is_recurring) {
                if (confirm(`Delete "${event.name}"?`)) {
                    this.confirmDelete('all', event, instanceDate);
                }
                return;
            }
            this.deletingEvent = event;
            this.deletingDate = instanceDate;
            this.showDeleteModal = true;
        },

        async confirmDelete(mode, event = null, date = null) {
            const targetEvent = event || this.deletingEvent;
            const targetDate = date || this.deletingDate;
            
            if (mode === 'single') {
                const dateStr = new Date(targetDate).toLocaleDateString('en-CA'); 
                const updatedExceptions = targetEvent.exceptions ? [...targetEvent.exceptions, dateStr] : [dateStr];
                try {
                    await pb.collection('events').update(targetEvent.id, { "exceptions": updatedExceptions });
                    await this.refreshEvents();
                } catch (err) { console.error(err); }
            } 
            else if (mode === 'all') {
                try {
                    await pb.collection("events").delete(targetEvent.id);
                    this.events = this.events.filter(e => e.id !== targetEvent.id);
                } catch (err) { console.error(err); }
            }

            this.showDeleteModal = false;
            this.deletingEvent = null;
            this.deletingDate = null;
            this.render();
        },

        triggerEdit(event, instanceDate) {
            this.editingEvent = event;
            this.editingDate = instanceDate;

            if (!event.is_recurring) {
                this.openEditForm(event);
                return;
            }
            this.showEditChoiceModal = true;
        },

        async saveEdit() {
            if (!this.newName || !this.editingEvent) return;

            const eventDate = new Date(this.newDate + 'T00:00:00');
            
            const data = {
                "name": this.newName,
                "date": eventDate.toISOString(),
                "start_time": this.newTime,
                "end_time": this.newEndTime,
                "is_recurring": this.isRecurring,
                "recurrence_rule": this.isRecurring ? this.recurrenceRule : "weekly",
                "recurrence_end": (this.isRecurring && this.recurrenceEnd) ? 
                                new Date(this.recurrenceEnd + 'T23:59:59').toISOString() : null
            };

            try {
                if (this.editingEvent && this.editingEvent.id) {
                    await pb.collection('events').update(this.editingEvent.id, data);
                } else {
                    await pb.collection('events').create(data);
                }
                this.isEditMode = false;
                await this.refreshEvents();
                this.render();
            } catch (err) { console.error(err); }
        },

        async selectEditMode(mode) {
            this.showEditChoiceModal = false;
            
            if (mode === 'single') {
                const dateStr = this.editingDate.toLocaleDateString('en-CA');
                const updatedExceptions = this.editingEvent.exceptions ? [...this.editingEvent.exceptions, dateStr] : [dateStr];
                
                try {
                    await pb.collection('events').update(this.editingEvent.id, { "exceptions": updatedExceptions });
                    
                    this.openEditForm(this.editingEvent);
                    this.newDate = dateStr;
                    this.isRecurring = false;
                    this.editingEvent = null; 
                } catch (err) { console.error(err); }
            } else {
                this.openEditForm(this.editingEvent);
            }
        },

        openEditForm(event) {
            this.isEditMode = true;
            this.newName = event.name;
            this.newDate = new Date(event.date).toLocaleDateString('en-CA');
            this.newTime = event.start_time;
            this.newEndTime = event.end_time;
            this.newColor = event.color;
            this.isRecurring = event.is_recurring;
            this.recurrenceRule = event.recurrence_rule;
            this.recurrenceEnd = event.recurrence_end ? new Date(event.recurrence_end).toLocaleDateString('en-CA') : '';
            
            document.querySelector('section').scrollIntoView({ behavior: 'smooth' });
        },

        getStyle(hex) {
            let color = (hex && hex.startsWith('#')) ? hex : '#3b82f6';
            return `background-color: ${color}15; border-color: ${color}40; color: ${color};`;
        },

        isSameDay(d1, d2) {
            return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
        },
    }));
});