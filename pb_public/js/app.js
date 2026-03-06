const pb = new PocketBase(window.location.origin);

function timetableApp() {
    return {
        events: [],
        newName: '',

        async init() {
            try {
                this.events = await pb.collection('events').getFullList({
                    sort: '-created',
                });
            } catch (err) {
                console.error("Failed to fetch events:", err);
            }
        },

        async addEvent() {
            if (!this.newName.trim()) return;

            const data = {
                name: this.newName,
                time: new Date().toISOString()
            };

            try {
                const record = await pb.collection('events').create(data);
                this.events.unshift(record);
                this.newName = ''; 
            } catch (err) {
                alert("Error saving event. Check console.");
                console.error(err);
            }
        },

        formatDate(dateStr) {
            return new Date(dateStr).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit',
                weekday: 'long'
            });
        }
    }
}