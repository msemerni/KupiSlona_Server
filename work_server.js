const express = require('express');
const bodyParser = require('body-parser');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const multer = require('multer');
const { sign, verify } = require('jsonwebtoken');
const { hash, compare } = require('bcrypt');
const upload = multer({ dest: './public/upload/' });
const Sequelize = require('sequelize');

const APP_NAME = 'KupiSlona';
const JWT_SALT = 'JwT_SaLt82&';
const PORT = 4000;

// mariaDB:
// user: "mv"
// password: "MyNewPass5!"

//////////////////////////////////////////////////////////////////
function jwtCheck(req){
  if (req.headers.authorization){
      const token = req.headers.authorization.slice(7)
      try {
          return verify(token, JWT_SALT)
      }
      catch(e){
        console.log("ERROR: ", e);
      }
  }
}

// const { now } = require('sequelize/types/utils');
const sequelize = new Sequelize('mysql://mv:MyNewPass5!@127.0.0.1/slon');

class Ad extends Sequelize.Model {
  get user(){
    return this.getUser() 
}

get images(){
    return this.getImages() 
}
}

Ad.init({
  title: Sequelize.STRING,
  tags: Sequelize.STRING,
  description: Sequelize.STRING,
  price: Sequelize.INTEGER,
  address: Sequelize.STRING,
},
   { sequelize, modelName: 'ad' })

// // sequelize.sync();

class User extends Sequelize.Model {
  get userAds(){
      return this.getAds()
  }
}

User.init({
  login: Sequelize.STRING,
  password: Sequelize.STRING,
  nick: Sequelize.STRING,
  phones: Sequelize.STRING,
  address: Sequelize.STRING,
}, { sequelize, modelName: 'user' })

User.hasMany(Ad)
Ad.belongsTo(User)

//////////
//// upload files:
class Image extends Sequelize.Model {

}
Image.init({
  originalname: Sequelize.STRING,
  mimetype: Sequelize.STRING,
  filename: Sequelize.STRING,
  size: Sequelize.INTEGER
},{sequelize, modelName: 'image'})

Image.belongsTo(User, {as: 'avatar'})
User.hasMany(Image, {as: 'avatars'})

Image.belongsTo(User)
User.hasMany(Image)

Image.belongsTo(Ad)
Ad.hasMany(Image)

//////////////////////////////////////////
class GlobalUser extends Sequelize.Model {
}

GlobalUser.init({
  login: Sequelize.STRING,
  password: Sequelize.STRING,
  nick: Sequelize.STRING,
  phones: Sequelize.STRING,
  address: Sequelize.STRING,
}, {sequelize, modelName: 'user'})

console.log("------------");

const schema = buildSchema(`
type Query{
  getAds: [Ad]
  getUser(id: ID!): User
  login(login: String, password:String): String
}

type Mutation{
  addAd(ad: AdInput): Ad
  editAd(id: ID, ad: AdInput): Ad
  register(login: String!, password: String!): User
  
}

type Ad{
  id: ID
  createdAt: String
  updatedAt: String

  userId: ID
  title: String
  tags: String
  description: String
  price: Int
  address: String


  user: User
  images: [Image]
}

input AdInput {
  title: String
  tags: String
  description: String
  price: Int
  address: String
  
  imageIds: [ID]
  
}

type User {
  id: ID
  createdAt: String
  updatedAt: String

  login: String
  nick: String
  phones: String
  address: String

  userAds: [Ad]
}

type Image {
  id: ID
  createdAt: String
  updatedAt: String

  originalname: String,
  mimetype: String,
  filename: String,
  size: Int
}
`)


const rootValue = {

  async getAds() {
    return await Ad.findAll({})
  },

  async getUser({ id },) {
    return await User.findByPk(id)
  },
  
  async addAd({ ad }, { thisUser }) {
    // console.log("THIS USER:", thisUser);
    if (thisUser) {
      if (await thisUser.hasImages(ad.imageIds)) {
        const newAd = await thisUser.createAd(ad);
        await newAd.setImages(ad.imageIds);
        return newAd;
      }
      throw new Error("Not user's image");
    }

    throw new Error("Unauthorized user");

  },

async editAd({id, ad}, {thisUser}){
  if (thisUser && await thisUser.hasImages(ad.imageIds || [])){
      const dbAd = await Ad.findByPk(id)
      if (dbAd.userId === thisUser.id){
          dbAd.ad = ad.title
          await dbAd.save()

          await dbAd.setImages(ad.imageIds)

          return dbAd
      }
  }
},

  async login({ login, password }) {
    if (!login || !password) {
      throw new Error("Wrong creditnails");
    } 

    const user = await GlobalUser.findOne({ where: { login } })
    // console.log(user);
    if (!user) {
      throw new Error("User not found");
    } 

    if (await compare(password, user.password)) {
      return sign({ id: user.id, login: user.login }, JWT_SALT)
    }

    throw new Error("Wrong password");
  },

  async register({ login, password }, { thisUser }) {
    if (!login || !password) {
      throw new Error("Wrong creditnails");
    } 
    if (!thisUser) {
      throw new Error("User already loginned");
    }
    if (!(await GlobalUser.findOne({ where: { login } }))) {
      return await GlobalUser.create({login, password: await hash(password, 10)});
    }
    throw new Error("User already exist");
  }
}

const app = express();
app.use(express.static('public'));
app.use(bodyParser.json());


app.use('/graphql', graphqlHTTP(async (req, res) => {
  const decodedUser = jwtCheck(req);
  console.log("DECODED USER: ", decodedUser);
  //console.log(req)
  if (decodedUser){
      // const models   = getModels(decodedUser.id)
      const thisUser = await User.findByPk(decodedUser.id);
      // const thisUser = await models.User.findByPk(decodedUser.id);
      return {
          schema,
          rootValue,
          graphiql: true,
          context: {thisUser} 
          // context: {thisUser, models}
      }
  }
  return {
      schema,
      rootValue,
      graphiql: true,
      context: {}
      // context: {models: getModels(-1)}
  }
}))


app.post('/upload', upload.single('file'), async (req, res) => {
    const decodedUser = jwtCheck(req)
    if (decodedUser) {
      const {originalname, mimetype, filename, size} = req.file
      const image = await Image.create({originalname, mimetype, filename, size, userId: decodedUser.id})

      res.status(201).end(JSON.stringify(image))
    }
    else {
      res.status(403).end('Unauthorized file upload prohibited')
  }
    
});

app.listen(PORT, () => {
  console.log(`"${APP_NAME}" is listening on port:${PORT}`)
})

///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
; (async () => {
  await sequelize.sync({ force: true }) // пересоздаст таблицы
  // await sequelize.sync()
  // const test = await GlobalUser.create({ 
  //   login: 'vasya', 
  //   password: await hash('123123', 10),
  // });
  // const petya = await GlobalUser.create({ 
  //   login: 'petya', 
  //   password: await hash('123123', 10),
  // });

  // // // // // // await vasya.createAd({ 
  // // // // // //   title: 'Продам телефон',
  // // // // // //   tags: "Electronics",
  // // // // // //   description: "Xiaomi MI9 ",
  // // // // // //   price: 700,
  // // // // // //   address: "Харьков",
  // // // // // // });

  // // // // // // await petya.createAd({
  // // // // // //    title: 'Частный дом',
  // // // // // //    tags: "House and garden",
  // // // // // //    description: "Частный дом 100 квадратов",
  // // // // // //    price: 15000,
  // // // // // //    address: "Харьков",
  // // // // // //    });

  // // // // // // await vasya.createAd({ 
  // // // // // //   title: 'Продам диван',
  // // // // // //   tags: "House and garden",
  // // // // // //   description: "Новый диван",
  // // // // // //   price: 2000,
  // // // // // //   address: "Киев",
  // // // // // //   });

  // // // // // // const newad = await Ad.create({
  // // // // // //    title: "Срочно продам Lexus",
  // // // // // //    tags: "Auto",
  // // // // // //    description: "Пробег 200 тыщ",
  // // // // // //    price: 20000,
  // // // // // //    address: "Красноград",
  // // // // // //   });
  // // // // // // await newad.setUser(petya);

  // // // // // // console.log(await vasya.getAds())
})();

// console.log(User.prototype);
// console.log(Ad.prototype);
// console.log(Image.prototype);



































///////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////
// class Ad extends Sequelize.Model {
  // get user() {
  //     return this.getUser()
  // }

  // get images() {
  //     return this.getImages()
  // }
// }

// Ad.init({
//   title: Sequelize.STRING,
//   tags: Sequelize.STRING,
//   description: Sequelize.STRING,
//   price: Sequelize.INTEGER,
//   address: Sequelize.STRING,
// }, { sequelize, modelName: 'ad' })

// class User extends Sequelize.Model {
//   // get userAds() {
//   //     return this.getAds()
//   // }
// }

// User.init({
//   login: Sequelize.STRING,
//   password: Sequelize.STRING,
//   nick: Sequelize.STRING,
//   phones: Sequelize.STRING,
//   address: Sequelize.STRING,

// }, { sequelize, modelName: 'user' })

// User.hasMany(Ad)
// Ad.belongsTo(User)





// //// upload files:
// class Image extends Sequelize.Model {

// }
// Image.init({
//   originalname: Sequelize.STRING,
//   mimetype: Sequelize.STRING,
//   filename: Sequelize.STRING,
//   size: Sequelize.INTEGER
// }, { sequelize, modelName: 'image' })

// Image.belongsTo(User, { as: 'avatar' })
// User.hasMany(Image, { as: 'avatars' })

// Image.belongsTo(User)
// User.hasMany(Image)

// Image.belongsTo(Ad)
// Ad.hasMany(Image)
// //////////


// console.log("------------")

  // ; (async () => {
  //   await sequelize.sync({ force: true }) // пересоздаст таблицы
  //   // await sequelize.sync()
  //   const vasya = await User.create({
  //     login: 'vasya',
  //     password: '123123',
  //     nick: 'Vasya'
  //   });
  //   const petya = await User.create({
  //     login: 'petya',
  //     password: '123123',
  //     nick: 'Petya'
  //   });

  //   await vasya.createAd({
  //     title: 'Продам телефон',
  //     tags: "Телефоны",
  //     description: "Супер телефон",
  //     price: 200,
  //     address: "Харьков",
  //   });

  // })();

// console.log(User.prototype)
// console.log(Ad.prototype)
// console.log(Image.prototype)

///////////////////////////////////////////////////////

// const schema = buildSchema(`
//   type Query{
//       getAds: [Ad]
//       getUser(id: ID!): User
//       login(login: String, password:String): String
//   }

//   type Mutation{
//       addAd(ad: AdInput): Ad
//       editAd(id: ID, ad: AdInput): Ad
//       register(login: String!, password: String!): User
//   }

//   type Ad{
//       id: ID
//       createdAt: String
//       updatedAt: String

//       userId: ID
//       title: String

//       user: User
//       images: [Image]
//   }

//   input AdInput {
//       title: String
//       imageIds: [ID]
//   }

//   type User {
//       id: ID
//       createdAt: String
//       updatedAt: String

//       login: String
//       nick: String

//       userAds: [Ad]
//   }

//   type Image {
//       id: ID
//       createdAt: String
//       updatedAt: String

//       originalname: String,
//       mimetype: String,
//       filename: String,
//       size: Int
//   }
// `)