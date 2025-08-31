const logger = require('../Log/Logger');

const {
    getRandomCity,
    getFemaleMiddleName,
    getRandomName
} = require('./utils');

const {
    FIRST_NAMES_MALE,
    FIRST_NAMES_FEMALE,
    MIDDLE_NAMES,
    LAST_NAMES,
    CITIES,
    STREETS
} = require('./constants');

class DataGenerator {

    static Generate(TOTAL_ITEMS, logging = true) {
        const fullData = new Array(TOTAL_ITEMS);
        const cityCache = this.generateCityCache(TOTAL_ITEMS);

        for (let i = 0; i < TOTAL_ITEMS; i++) {
            const isMale = Math.random() > 0.5;
            const firstName = this.generateFirstName(isMale);
            const middleName = this.generateMiddleName(isMale);
            const lastName = this.generateLastName(isMale);
            const city = cityCache[i];
            const address = this.generateAddress(city);

            fullData[i] = {
                id: i + 1,
                name: `${lastName} ${firstName} ${middleName}`,
                description: `Контактное лицо: ${firstName} ${middleName}, тел. +7${9000000000 + i}`,
                address: address,
                isMale: isMale
            };
        }

        logger.Log(`Сгенерировано ${TOTAL_ITEMS} элементов в памяти`, logging);

        return fullData;
    }

    //static generateEasy(count) {
    //    const cities = ['Moscow', 'London', 'New York', 'Tokyo', 'Berlin', 'Paris', 'Sydney'];
    //    const data = [];

    //    for (let i = 1; i <= count; i++) {
    //        data.push({
    //            id: i,
    //            name: `Item ${i}`,
    //            description: `Description for item ${i}`,
    //            address: `Address ${i}`,
    //            city: cities[i % cities.length]
    //        });
    //    }
    //    return data;
    //}

    static generateCityCache(totalItems) {
        const cityCache = new Array(totalItems);
        for (let i = 0; i < totalItems; i++) {
            cityCache[i] = getRandomCity(CITIES);
        }
        return cityCache;
    }

    static generateFirstName(isMale) {
        return isMale ? getRandomName(FIRST_NAMES_MALE) : getRandomName(FIRST_NAMES_FEMALE);
    }

    static generateMiddleName(isMale) {
        const maleMiddleName = getRandomName(MIDDLE_NAMES);
        return isMale ? maleMiddleName : getFemaleMiddleName(maleMiddleName);
    }

    static generateLastName(isMale) {
        let lastName = getRandomName(LAST_NAMES);
        if (!isMale) {
            if (lastName.endsWith('ов') || lastName.endsWith('ев') || lastName.endsWith('ин')) {
                lastName += 'а';
            }
        }
        return lastName;
    }

    static generateAddress(city) {
        const street = STREETS[Math.floor(Math.random() * STREETS.length)];
        const houseNumber = Math.floor(Math.random() * 100) + 1;
        const apartment = Math.floor(Math.random() * 200) + 1;
        return `г. ${city}, ул. ${street}, д. ${houseNumber}, кв. ${apartment}`;
    }
}

module.exports = DataGenerator;