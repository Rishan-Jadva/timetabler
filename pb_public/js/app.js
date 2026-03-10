document.addEventListener('alpine:init', () => {
    const pb = new PocketBase(window.location.origin);

    Alpine.data('timetableApp', () => ({
        viewMode: 'month',
        currentDate: new Date(),
        grid: [],
        days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],

        events: [],
        newName: '',
        newDay: 'Sunday',
        newTime: '09:00',
        newColor: '#3b82f6',

        async init() {
            await this.refreshEvents();
            this.render();
            this.$watch('viewMode', () => this.render());
            this.$watch('currentDate', () => this.render());
        },

        next() { this.adjustDate(1); },
        prev() { this.adjustDate(-1); },
        today() { 
            this.currentDate = new Date(); 
            this.render();
        },

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
            } else if (this.viewMode === 'year') {
                this.grid = this.months.map((name, index) => ({
                    name,
                    index,
                    days: this.generateMonthGrid(new Date(this.currentDate.getFullYear(), index, 1))
                }));
            } else if (this.viewMode === 'week') {
                this.grid = this.generateWeekGrid();
            }
        },

        getEventsForDay(dayName) {
            return this.events.filter(e => e.day === dayName);
        },

        generateMonthGrid(date) {
            const year = date.getFullYear();
            const month = date.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const todayStr = new Date().toDateString();

            const cells = [];
            for (let i = 0; i < firstDay; i++) {
                cells.push({ day: '', dayName: '', current: false });
            }
            for (let i = 1; i <= daysInMonth; i++) {
                const cellDate = new Date(year, month, i);
                cells.push({ 
                    day: i, 
                    dayName: this.days[cellDate.getDay()],
                    current: cellDate.toDateString() === todayStr 
                });
            }
            return cells;
        },

        generateWeekGrid() {
            const start = new Date(this.currentDate);
            start.setDate(this.currentDate.getDate() - this.currentDate.getDay());
            const todayStr = new Date().toDateString();

            return Array.from({length: 7}, (_, i) => {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                return {
                    name: this.days[i],
                    date: d.getDate(),
                    isToday: d.toDateString() === todayStr
                };
            });
        },

        getHeaderText() {
            if (this.viewMode === 'year') return this.currentDate.getFullYear();
            if (this.viewMode === 'day') {
                return `${this.days[this.currentDate.getDay()]}, ${this.months[this.currentDate.getMonth()]} ${this.currentDate.getDate()}`;
            }
            return `${this.months[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
        },

        async refreshEvents() {
            try {
                this.events = await pb.collection('events').getFullList({
                    sort: 'day,start_time',
                });
            } catch (err) {
                console.error("Fetch failed:", err);
            }
        },

        async addEvent() {
            if (!this.newName.trim()) return;
            try {
                await pb.collection('events').create({
                    name: this.newName,
                    day: this.newDay,
                    start_time: this.newTime,
                    color: this.newColor
                });
                this.newName = '';
                await this.refreshEvents();
            } catch (err) {
                console.error("Add failed:", err);
            }
        },

        async deleteEvent(id) {
            if(!confirm("Delete this event?")) return;
            try {
                await pb.collection("events").delete(id);
                this.events = this.events.filter(e => e.id !== id);
            } catch (err) {
                console.error("Delete failed:", err);
            }
        },

        getDaySuffix(day) {
            if (day > 3 && day < 21) return 'th';
            switch (day % 10) {
                case 1:  return "st";
                case 2:  return "nd";
                case 3:  return "rd";
                default: return "th";
            }
        },

        getStyle(hex) {
            let color = (hex && hex.startsWith('#')) ? hex : '#3b82f6';

            const adjustColor = (hexCode) => {
                let r = parseInt(hexCode.slice(1, 3), 16);
                let g = parseInt(hexCode.slice(3, 5), 16);
                let b = parseInt(hexCode.slice(5, 7), 16);

                const luminance = (0.299 * r + 0.587 * g + 0.114 * b);

                if (luminance < 80) {
                    r = Math.min(255, r + 120);
                    g = Math.min(255, g + 120);
                    b = Math.min(255, b + 120);
                    return `rgb(${r}, ${g}, ${b})`;
                }
                return hexCode;
            };

            const displayColor = adjustColor(color);

            return `
                background-color: ${displayColor}15; 
                border: 1px solid ${displayColor}40; 
                color: ${displayColor};
                box-shadow: 0 4px 10px -2px ${displayColor}10;
            `;
        }
    }));
});