// import axios from 'axios';
const axios = require("axios");

exports.getChain = async (req, res) => {
  const names = [
    "Alice",
    "Bob",
    "Charlie",
    "David",
    "Elise",
    "Fender",
    "Graham",
    "Harris",
  ];

  let result = [];

  while (result.length != names.length) {
    const name = names[Math.floor(Math.random() * names.length)];
    if (result.includes(name)) continue;
    try {
      // const response = await axios.get("https://cataas.com/cat?json=true");
      result.push({
        name: name,
        // avatar: response.data.url
      });
    } catch (error) {
      console.error(error);
    }
  }

  return res.json({
    chain: result,
  });
};
