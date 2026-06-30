// ===== MINI EDF PARSER WITH HEADER SUPPORT =====
(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory();
    } else {
        root.MiniEDF = factory();
    }
}(this, function() {

'use strict';

function readStr(view, offset, length) {
    return new TextDecoder()
        .decode(new Uint8Array(view.buffer, offset, length))
        .trim();
}

function readNum(view, offset, length) {
    const str = readStr(view, offset, length);
    return parseFloat(str);
}

class Channel {
    constructor() {
        this.label = '';
        this.samples = null;

        this.digital_min_value = 0;
        this.digital_max_value = 0;
        this.physical_min_value = 0;
        this.physical_max_value = 0;

        this.samples_per_record = 0;
    }
}

class MiniEDF {
    constructor() {
        this.channels = [];
        this.num_channels = 0;
        this.duration = 0;
        this.num_records = 0;
        this.record_duration = 0;
    }

    parseDirectData(buffer) {

        console.log('🔍 Parsing EDF with header...');

        const view = new DataView(buffer);

        // ===== MAIN HEADER =====
        const numSignals = parseInt(readStr(view, 252, 4));
        const numRecords = parseInt(readStr(view, 236, 8));
        const recordDuration = parseFloat(readStr(view, 244, 8));

        console.log('Channels:', numSignals);
        console.log('Records:', numRecords);
        console.log('Record duration:', recordDuration);

        this.num_channels = numSignals;
        this.num_records = numRecords;
        this.record_duration = recordDuration;

        // ===== CHANNEL HEADERS =====
        let offset = 256;

        const labels = [];
        const physMin = [];
        const physMax = [];
        const digMin = [];
        const digMax = [];
        const samplesPerRecordArr = [];

        // labels
        for (let i = 0; i < numSignals; i++) {
            labels.push(readStr(view, offset, 16));
            offset += 16;
        }

        // skip transducer
        offset += numSignals * 80;

        // skip units
        offset += numSignals * 8;

        // physical min
        for (let i = 0; i < numSignals; i++) {
            physMin.push(readNum(view, offset, 8));
            offset += 8;
        }

        // physical max
        for (let i = 0; i < numSignals; i++) {
            physMax.push(readNum(view, offset, 8));
            offset += 8;
        }

        // digital min
        for (let i = 0; i < numSignals; i++) {
            digMin.push(readNum(view, offset, 8));
            offset += 8;
        }

        // digital max
        for (let i = 0; i < numSignals; i++) {
            digMax.push(readNum(view, offset, 8));
            offset += 8;
        }

        // skip prefilter
        offset += numSignals * 80;

        // samples per record
        for (let i = 0; i < numSignals; i++) {
            samplesPerRecordArr.push(readNum(view, offset, 8));
            offset += 8;
        }

        // skip reserved
        offset += numSignals * 32;

        const dataOffset = offset;

        console.log('Data starts at:', dataOffset);

        // ===== CREATE CHANNELS =====
        for (let i = 0; i < numSignals; i++) {
            const ch = new Channel();

            ch.label = labels[i];
            ch.physical_min_value = physMin[i];
            ch.physical_max_value = physMax[i];
            ch.digital_min_value = digMin[i];
            ch.digital_max_value = digMax[i];
            ch.samples_per_record = samplesPerRecordArr[i];

            const totalSamples = numRecords * ch.samples_per_record;
            ch.samples = new Float32Array(totalSamples);

            this.channels.push(ch);

            console.log(
                `📊 ${ch.label}: spr=${ch.samples_per_record}, ` +
                `phys=[${ch.physical_min_value}, ${ch.physical_max_value}]`
            );
        }

        // ===== READ DATA =====
        let ptr = dataOffset;

        for (let r = 0; r < numRecords; r++) {

            for (let c = 0; c < numSignals; c++) {

                const ch = this.channels[c];

                const scale =
                    (ch.physical_max_value - ch.physical_min_value) /
                    (ch.digital_max_value - ch.digital_min_value);

                const offsetPhys =
                    ch.physical_min_value -
                    ch.digital_min_value * scale;

                for (let s = 0; s < ch.samples_per_record; s++) {

                    const raw = view.getInt16(ptr, true);
                    ptr += 2;

                    const value = raw * scale + offsetPhys;

                    const index = r * ch.samples_per_record + s;
                    ch.samples[index] = value;
                }
            }
        }

        // ===== DURATION =====
        this.duration = numRecords * recordDuration;

        console.log('✅ Duration:', this.duration.toFixed(2), 'sec');

        // ===== DEBUG RANGE =====
        for (let c = 0; c < numSignals; c++) {
            const ch = this.channels[c];

            let min = Infinity;
            let max = -Infinity;

            for (let i = 0; i < ch.samples.length; i++) {
                const v = ch.samples[i];
                if (v < min) min = v;
                if (v > max) max = v;
            }

            console.log(
                `📈 ${ch.label}: [${min.toFixed(1)}, ${max.toFixed(1)}] μV`
            );
        }

        return this;
    }
}

return MiniEDF;

}));