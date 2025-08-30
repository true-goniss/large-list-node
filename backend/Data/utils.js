function getFemaleMiddleName(maleMiddleName) {
    if (maleMiddleName.endsWith('ович')) {
        return maleMiddleName.replace('ович', 'овна');
    } else if (maleMiddleName.endsWith('евич')) {
        return maleMiddleName.replace('евич', 'евна');
    } else if (maleMiddleName.endsWith('ич')) {
        return maleMiddleName.replace('ич', 'ична');
    }
    return maleMiddleName;
};

function getRandomCity(cities) {
    const totalPopulation = cities.reduce((sum, city) => sum + city.population, 0);
    let random = Math.random() * totalPopulation;
    for (const city of cities) {
        random -= city.population;
        if (random <= 0) {
            return city.name;
        }
    }

    return cities[0].name;
};

function getRandomName(names) {
    for (const nameData of names) {
        if (getWeightedBool(nameData.probability)) {
            return nameData.name;
        }
    }

    return names[0].name;
};

function getWeightedBool(probability) {
    return Math.random() < probability;
}

module.exports = {
    getFemaleMiddleName,
    getRandomCity,
    getRandomName
}